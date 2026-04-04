import { useState, useRef, useMemo, useCallback } from 'react';
import { useHealthStore, type HealthReport } from '../stores/healthStore';
import { FileText, Upload, Trash2, Eye, X, Calendar, ChevronDown, ChevronRight, Beaker, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatDate } from '../lib/utils';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import TrendChart from '../components/Dashboard/TrendChart';

const REPORT_TYPES = [
  { value: 'lab_results', label: 'Lab Results' },
  { value: 'blood_test', label: 'Blood Test' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'stool_test', label: 'Stool Test' },
  { value: 'specialty', label: 'Specialty' },
  { value: 'genetic', label: 'Genetic' },
  { value: 'doctor_notes', label: 'Doctor Notes' },
  { value: 'pathology', label: 'Pathology' },
  { value: 'general', label: 'General' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'discharge', label: 'Discharge' },
  { value: 'lab_panel', label: 'Lab Panel' },
  { value: 'other', label: 'Other' },
];

/* ── Auto-extract date, type, and clean title from filename ── */
function parseReportFilename(raw: string): { title: string; type: string; date: string | null } {
  let title = raw;
  let type = 'lab_results';
  let date: string | null = null;

  // Detect report type from keywords
  const lower = raw.toLowerCase();
  if (/\bmri\b|imaging|x[\s-]?ray|ct\b|cta\b|dexa|ultrasound|scan/i.test(lower)) type = 'imaging';
  else if (/\bstool\b|gi[\s-]?map|microbiome/i.test(lower)) type = 'stool_test';
  else if (/\bdr\.|doctor|appt|notes|tetlow|leist|wolk|phone notes|summary|supplement|intake/i.test(lower)) type = 'doctor_notes';
  else if (/\bgenetic|genome|3x4|dna\b/i.test(lower)) type = 'genetic';
  else if (/\blyme|mycotox|zoomer|glyphosate|antigen|p88|grail|metal test|hair analysis/i.test(lower)) type = 'specialty';
  else if (/\blab\b|labcorp|vibrant|blood/i.test(lower)) type = 'lab_results';

  // Try to extract date patterns

  // Pattern: "M-D-YY" or "M-DD-YY" (e.g., "2 24 23", "12 2 24", "11 18 24")
  const mdyy = raw.match(/(\d{1,2})[\s\-\/](\d{1,2})[\s\-\/](\d{2})\b/);
  if (mdyy) {
    const m = parseInt(mdyy[1]);
    const d = parseInt(mdyy[2]);
    let y = parseInt(mdyy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      y = y < 50 ? 2000 + y : 1900 + y;
      date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Pattern: month name + year (e.g., "May 2023", "June 2025", "Oct. 2025", "Nov 2024")
  if (!date) {
    const monthYear = raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?\s*(\d{4})/i);
    if (monthYear) {
      const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const monthKey = monthYear[1].toLowerCase().slice(0, 3);
      const mm = months[monthKey];
      if (mm) date = `${monthYear[2]}-${mm}-01`;
    }
  }

  // Pattern: standalone 4-digit year (e.g., "2016", "2019", "2022")
  if (!date) {
    const yearOnly = raw.match(/\b(20\d{2})\b/);
    if (yearOnly) {
      date = `${yearOnly[1]}-01-01`;
    }
  }

  // Clean up title: remove "copy", trailing numbers, extra spaces
  title = title
    .replace(/\bcopy\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title, type, date };
}

function getReportYear(report: HealthReport): string {
  if (report.report_date) {
    return new Date(report.report_date).getFullYear().toString();
  }
  return 'Unknown';
}

/* ── Lab Explorer Categories ── */
const LAB_CATEGORIES: Array<{ key: string; label: string; icon: string; regions: string[]; description: string }> = [
  { key: 'blood', label: 'Blood Work', icon: '🩸', regions: ['blood'], description: 'CBC, hormones, vitamins, minerals, immune markers' },
  { key: 'heart', label: 'Cardiovascular', icon: '❤️', regions: ['heart'], description: 'Cholesterol, triglycerides, ApoB, lipid panel' },
  { key: 'liver', label: 'Liver Function', icon: '🫁', regions: ['liver'], description: 'AST, ALT, bilirubin, albumin, GGT' },
  { key: 'kidneys', label: 'Kidney Function', icon: '💧', regions: ['kidneys'], description: 'eGFR, creatinine, BUN, uric acid' },
  { key: 'gut', label: 'Gut & Stool', icon: '🧫', regions: ['abdomen', 'stomach'], description: 'GI-MAP, H. pylori, Candida, stool markers' },
  { key: 'neuro', label: 'Neurological', icon: '🧠', regions: ['head'], description: 'TSH, prolactin, neurofilament, NMO' },
];

/* ── Metric Descriptions (plain-language explanations) ── */
function getMetricDescription(name: string): string | null {
  const n = name.toLowerCase();
  const descriptions: Record<string, string> = {
    // Blood counts
    'wbc': 'White blood cells fight infection. A count that is too high can mean your body is fighting off illness, while a low count may mean your immune system is weakened.',
    'rbc': 'Red blood cells carry oxygen from your lungs to the rest of your body. Low levels can cause fatigue and shortness of breath (anemia), while high levels may thicken your blood.',
    'hemoglobin': 'Hemoglobin is the protein inside red blood cells that carries oxygen. Low hemoglobin is the hallmark of anemia and can leave you feeling tired and weak.',
    'hematocrit': 'Hematocrit measures what percentage of your blood is made up of red blood cells. It helps doctors spot anemia or dehydration.',
    'platelets': 'Platelets help your blood clot when you get a cut. Too few can cause excessive bleeding, and too many can increase risk of blood clots.',
    'mcv': 'Mean Corpuscular Volume measures the average size of your red blood cells. Abnormal sizes can point to different types of anemia or vitamin deficiencies.',
    'mch': 'Mean Corpuscular Hemoglobin shows how much hemoglobin is in each red blood cell on average. It helps classify different types of anemia.',
    'mchc': 'MCHC measures the average concentration of hemoglobin in your red blood cells. It is useful for diagnosing iron deficiency and other blood conditions.',
    'rdw': 'Red Cell Distribution Width measures how much your red blood cells vary in size. A high number can be an early sign of iron or vitamin deficiency.',
    'mpv': 'Mean Platelet Volume tells the average size of your platelets. Larger platelets are younger and more active, which can indicate your body is making more to replace ones being used up.',
    // Lipids
    'total cholesterol': 'Total cholesterol is the overall amount of cholesterol in your blood. Keeping it in a healthy range reduces your risk of heart disease and stroke.',
    'ldl cholesterol': 'LDL is often called "bad" cholesterol because high levels cause plaque buildup in your arteries, raising heart attack and stroke risk.',
    'hdl cholesterol': 'HDL is "good" cholesterol. It helps remove LDL from your arteries and carries it back to the liver for disposal. Higher levels are protective.',
    'triglycerides': 'Triglycerides are a type of fat in your blood. High levels, especially combined with high LDL or low HDL, increase your risk for heart disease.',
    'vldl': 'VLDL carries triglycerides through your blood. Like LDL, high levels contribute to plaque buildup in arteries.',
    'apolipoprotein b': 'ApoB is the main protein on LDL particles. It is considered one of the best single markers for predicting cardiovascular risk.',
    'apob': 'ApoB is the main protein on LDL particles. It is considered one of the best single markers for predicting cardiovascular risk.',
    'lp(a)': 'Lipoprotein(a) is a genetic risk factor for heart disease. Unlike regular cholesterol, diet and exercise have little effect on it.',
    // Liver
    'ast': 'AST is an enzyme found mainly in the liver and heart. Elevated levels can signal liver damage, muscle injury, or heart problems.',
    'alt': 'ALT is an enzyme mostly found in the liver. A high level is one of the most specific signs that the liver is inflamed or damaged.',
    'alkaline phosphatase': 'Alkaline phosphatase (ALP) is an enzyme in the liver and bones. High levels may point to liver disease, bile duct problems, or bone disorders.',
    'bilirubin': 'Bilirubin is a yellow pigment produced when red blood cells break down. High levels cause jaundice and may indicate liver or gallbladder issues.',
    'albumin': 'Albumin is a protein made by the liver that keeps fluid in your bloodstream. Low levels can indicate liver disease, kidney problems, or malnutrition.',
    'total protein': 'Total protein measures albumin and globulins in your blood. Abnormal levels can reflect liver disease, kidney disease, or immune system problems.',
    'ggt': 'GGT is a liver enzyme that rises when the liver is stressed, especially by alcohol or medications. It is a sensitive marker for bile duct problems.',
    // Kidney
    'egfr': 'eGFR estimates how well your kidneys filter waste from your blood. A low number means your kidneys are not working as well as they should.',
    'creatinine': 'Creatinine is a waste product from muscle activity that your kidneys filter out. High levels suggest your kidneys may not be filtering properly.',
    'bun': 'Blood Urea Nitrogen measures waste product from protein digestion. High levels can indicate kidney problems, dehydration, or a high-protein diet.',
    'uric acid': 'Uric acid forms when the body breaks down purines from food. High levels can cause gout (painful joint inflammation) and may harm the kidneys.',
    // Thyroid
    'tsh': 'TSH is the hormone that tells your thyroid to work. A high level usually means your thyroid is underactive, while a low level may mean it is overactive.',
    'free t4': 'Free T4 is the active thyroid hormone that controls your metabolism, energy, and body temperature. Abnormal levels affect how fast or slow your body runs.',
    'free t3': 'Free T3 is the most active thyroid hormone. Low levels can cause fatigue and weight gain, while high levels may cause anxiety and rapid heart rate.',
    // Inflammation
    'crp': 'C-Reactive Protein rises when there is inflammation anywhere in the body. Elevated levels are also linked to higher cardiovascular risk.',
    'hs-crp': 'High-sensitivity CRP detects low-grade inflammation linked to heart disease risk, even when you feel healthy.',
    'esr': 'Erythrocyte Sedimentation Rate measures how fast red blood cells settle in a tube. A high rate suggests inflammation somewhere in the body.',
    'ferritin': 'Ferritin reflects your body\'s iron stores. Low levels mean low iron (often causing fatigue), while very high levels can indicate inflammation or iron overload.',
    'iron': 'Iron is essential for making hemoglobin and carrying oxygen. Low iron causes anemia and fatigue; too much iron can damage organs.',
    // Vitamins
    'vitamin d 25-hydroxy': 'Vitamin D supports immune function, bone health, and mood. Your levels have fluctuated — the goal is 50-80 ng/mL. Your DaVinci ADK supplement helps maintain optimal levels.',
    'vitamin b12': 'Vitamin B12 is vital for nerve function and making red blood cells. Deficiency can cause fatigue, numbness, and memory problems.',
    'folate': 'Folate (vitamin B9) is needed for cell growth and DNA repair. Low levels can cause anemia and are especially important during pregnancy.',
    // Metabolic
    'glucose': 'Blood glucose is your blood sugar level. Consistently high readings can indicate prediabetes or diabetes, which affects your heart, kidneys, and nerves over time.',
    'hemoglobin a1c': 'HbA1c shows your average blood sugar over the past 2 to 3 months. It is the gold standard for monitoring diabetes control.',
    'hba1c': 'HbA1c shows your average blood sugar over the past 2 to 3 months. It is the gold standard for monitoring diabetes control.',
    'insulin': 'Insulin is the hormone that moves sugar from your blood into cells. High fasting insulin can be an early warning sign of insulin resistance and future diabetes.',
    // Hormones
    'testosterone': 'Testosterone affects muscle mass, bone density, energy, and mood in both men and women. Low levels can cause fatigue, low libido, and loss of muscle.',
    'estradiol': 'Estradiol is the primary form of estrogen. It plays a key role in reproductive health, bone density, and cardiovascular protection.',
    'cortisol': 'Cortisol is your main stress hormone. Chronically high levels can disrupt sleep, weaken immunity, and increase belly fat.',
    'dhea-s': 'DHEA-S is a precursor hormone that your body converts into testosterone and estrogen. It tends to decline with age and low levels may affect energy and mood.',
    'progesterone': 'Progesterone supports pregnancy and regulates the menstrual cycle. Imbalances can cause irregular periods, mood changes, and sleep problems.',
    // Electrolytes
    'sodium': 'Sodium helps regulate fluid balance and nerve signals. Abnormal levels can cause confusion, muscle cramps, or in severe cases, seizures.',
    'potassium': 'Potassium is critical for heart rhythm and muscle function. Both very high and very low levels can be dangerous for your heart.',
    'calcium': 'Calcium is essential for bones, muscles, and nerves. Abnormal blood calcium can indicate parathyroid, kidney, or bone problems.',
    'magnesium': 'Magnesium supports over 300 enzyme reactions including muscle, nerve, and heart function. Low levels are common and can cause cramps, fatigue, and irregular heartbeat.',
    'chloride': 'Chloride works with sodium to maintain fluid balance. Abnormal levels usually follow sodium changes and can indicate dehydration or kidney issues.',
    'co2': 'CO2 (bicarbonate) helps maintain your blood\'s acid-base balance. Low levels can mean your blood is too acidic, while high levels may suggest it\'s too alkaline.',
    // Immune markers
    'shbg': 'Sex Hormone Binding Globulin is a protein that binds to testosterone and estrogen, controlling how much is available for your body to use. High SHBG means less free testosterone is available, which can affect energy, libido, and muscle building.',
    'anti-dnase b': 'Anti-DNase B is an antibody your body makes to fight Group A Streptococcus bacteria. Persistently high levels mean your body has been battling a strep infection — possibly chronic. This is important because chronic strep can trigger autoimmune reactions.',
    'antistreptolysin': 'ASO (Antistreptolysin O) antibodies rise after a strep infection. Persistently elevated levels, like yours, suggest your body is still fighting strep bacteria. This chronic immune activation can contribute to inflammation throughout your body.',
    'ana': 'ANA (Antinuclear Antibody) tests for autoimmune activity. A positive result means your immune system may be attacking your own tissues. The 1:160 homogeneous pattern can be seen in conditions like lupus, MS, and other autoimmune diseases.',
    // Lyme / Tick-borne
    'bartonella': 'Bartonella is a bacteria spread by ticks, fleas, and cat scratches. A positive IgG means your body has antibodies against this infection — either past or current. Bartonella can cause fatigue, brain fog, joint pain, and neurological symptoms.',
    'babesia': 'Babesia is a parasite that infects red blood cells, spread by ticks. A positive IgM means ACTIVE infection. Symptoms include fatigue, sweats, chills, and headaches. It often co-occurs with Lyme disease and needs specific treatment (typically atovaquone + azithromycin).',
    'lyme': 'Lyme disease is caused by Borrelia bacteria from tick bites. A positive C6 peptide or antibody test confirms exposure. Lyme can cause joint pain, fatigue, brain fog, and neurological issues. Early treatment with antibiotics is important.',
    'c6 peptide': 'The C6 Peptide test is one of the most specific tests for Lyme disease. A positive result (index >1.09) confirms your immune system has responded to Borrelia bacteria. Your index of 2.78 is clearly positive.',
    'neurofilament': 'Neurofilament Light Chain (NFL) is released when nerve cells are damaged. Normal levels are reassuring — they mean your nerves are not actively being destroyed. This is important for monitoring conditions like MS.',
    'nmo': 'NMO (Neuromyelitis Optica) antibodies attack a specific protein in the brain and spinal cord. A negative result rules out NMO, which is important because it requires different treatment than MS.',
    'aqp4': 'Aquaporin-4 antibodies are specific to NMO (Neuromyelitis Optica). Negative is good — it means you don\'t have this particular autoimmune condition.',
    'mog antibody': 'MOG (Myelin Oligodendrocyte Glycoprotein) antibodies attack the coating on nerve fibers. Negative rules out MOG antibody disease, helping confirm the diagnosis.',
    // GI markers
    'h. pylori': 'H. pylori is a bacteria that lives in your stomach and can cause ulcers, acid reflux, and stomach inflammation. Your tests show persistent infection with antibiotic resistance — meaning standard antibiotics won\'t work. Natural protocols like Matula tea are being used instead.',
    'helicobacter': 'H. pylori is a bacteria that lives in your stomach and can cause ulcers, acid reflux, and stomach inflammation. Persistent infection needs targeted treatment.',
    'zonulin': 'Zonulin controls the "gates" between cells in your gut lining. High levels mean those gates are open too wide — a condition called "leaky gut." This allows food particles and bacteria to enter your bloodstream, triggering immune reactions and inflammation throughout your body.',
    'calprotectin': 'Calprotectin measures inflammation specifically in your intestines. Normal levels are good — it means you don\'t have active inflammatory bowel disease (IBD) like Crohn\'s or colitis.',
    'secretory iga': 'Secretory IgA is your gut\'s first line of immune defense. High levels mean your gut immune system is working overtime to fight something — often infections or food reactions. Low levels leave you more vulnerable to gut infections.',
    'elastase': 'Elastase measures how well your pancreas makes digestive enzymes. Normal levels mean your pancreas is doing its job properly — you\'re digesting proteins and fats well.',
    'candida': 'Candida is a yeast that naturally lives in your gut. When it overgrows (above 5,000), it can cause bloating, brain fog, sugar cravings, and skin issues. It often overgrows after antibiotic use.',
    'citrobacter': 'Citrobacter is a bacteria associated with inflammation and autoimmune reactions in the gut. Elevated levels can contribute to leaky gut and immune activation.',
    'streptococcus': 'Streptococcus in your gut is linked to autoimmune reactions. High gut strep, combined with your elevated blood strep antibodies, suggests your gut may be a reservoir for the strep driving your immune response.',
    'salmonella': 'Salmonella is a bacterial pathogen that causes food poisoning. Finding it in a stool test means an active or recent infection requiring treatment.',
    'klebsiella': 'Klebsiella is a bacteria linked to autoimmune conditions, particularly ankylosing spondylitis. High levels in your gut may contribute to systemic inflammation.',
    'akkermansia': 'Akkermansia muciniphila is a GOOD bacteria that strengthens your gut lining. Low or absent levels (like in your 2023 test) mean your gut barrier is weakened. The Pendulum supplement you\'re taking is specifically designed to restore it.',
    'bacteroidetes': 'Bacteroidetes is one of the two major bacterial families in your gut. The ratio between Bacteroidetes and Firmicutes affects your metabolism, immune system, and inflammation levels.',
    // Neural Zoomer
    'anti-myelin': 'Anti-Myelin antibodies attack the protective coating (myelin) on nerve fibers. Elevated levels indicate your immune system is targeting your own nerve insulation — this is the core mechanism behind demyelinating conditions like MS.',
    'anti-glycine receptor': 'Anti-Glycine Receptor antibodies attack receptors that help calm nerve signals. Elevated levels can cause muscle stiffness, spasms, and neurological symptoms. Your level of 23.1 is more than double the normal limit.',
    'anti-contactin': 'Anti-Contactin-Associated Protein (CASPR2) antibodies attack proteins needed for nerve signal transmission. Elevated levels are linked to pain syndromes, seizures, and cognitive issues. Your level of 27.0 is nearly 3x the normal limit.',
    'anti-dopamine receptor': 'Anti-Dopamine Receptor antibodies attack the brain\'s dopamine signaling system. Elevated levels can affect mood, motivation, movement, and cognitive function.',
    'anti-endothelin': 'Anti-Endothelin A Receptor antibodies affect blood vessel constriction in the brain. Elevated levels can contribute to headaches, blood pressure issues, and reduced blood flow to the brain.',
    'anti-ebv': 'Epstein-Barr Virus antibodies show past or reactivated EBV infection. EBV infects most people as kids (mono), but can reactivate later. Recent research strongly links EBV reactivation to triggering MS and other autoimmune conditions.',
    'ebv': 'Epstein-Barr Virus (EBV) is the virus that causes mono. Most people carry it lifelong. However, reactivation (shown by high IgG levels) is now considered a major trigger for MS and autoimmune conditions.',
    // Heavy metals
    'mercury': 'Mercury is a toxic heavy metal found mainly in fish (especially tuna, swordfish, king mackerel) and dental fillings. It accumulates in your brain and kidneys over time. Your levels have been borderline — reducing fish intake and using chelation support (like Ortho Turiva) helps clear it.',
    'gadolinium': 'Gadolinium is the contrast dye used in MRI scans. It\'s supposed to be cleared by your kidneys quickly, but small amounts can deposit in tissue. Your elevated hair level is from your multiple brain MRIs. With only one kidney, clearance may be slower.',
    'lead': 'Lead is a toxic metal that can accumulate from old paint, water pipes, and environmental exposure. Even low levels can affect brain function, blood pressure, and kidney health over time.',
    'arsenic': 'Arsenic exposure comes from rice, groundwater, and some treated wood. Low levels are generally safe, but chronic exposure can affect skin, nerves, and cancer risk.',
    // Hormones
    'testosterone total': 'Total testosterone includes both free (active) and bound forms. Your levels have been high (874-1235 ng/dL), likely from supplementation. While this gives energy and muscle benefits, very high levels combined with high SHBG need monitoring.',
    'free testosterone': 'Free testosterone is the portion actually available for your body to use (not bound to SHBG). Despite your high total testosterone, your free T is normal because your SHBG is binding much of it up.',
    'dihydrotestosterone': 'DHT is a more potent form of testosterone. It\'s important for male development but excess can cause hair loss and prostate growth. Your levels have been normal to slightly high.',
    'prolactin': 'Prolactin is a pituitary hormone. High levels in men can cause low libido and fatigue, and may indicate a pituitary issue. Your levels are normal.',
    'psa': 'PSA (Prostate-Specific Antigen) screens for prostate health. Your levels are well within normal range, which is reassuring.',
    // Other
    'vitamin d': 'Vitamin D supports immune function, bone health, and mood. Your levels have fluctuated (25.8 → 62.6 → 86.3 → 61.2). The goal is 50-80 ng/mL. Your DaVinci ADK supplement helps maintain optimal levels.',
    'homocysteine': 'Homocysteine is an amino acid that, when elevated, increases risk for heart disease and stroke. It\'s also a marker of methylation — the process your body uses to repair DNA. Your levels improved from 10.6 to 7.4 with B vitamin supplementation.',
    'dhea': 'DHEA-Sulfate is a hormone precursor your adrenal glands produce. It gets converted into testosterone and estrogen. Levels naturally decline with age.',
    'glyphosate': 'Glyphosate is the active ingredient in Roundup weed killer. It\'s found in non-organic food, especially wheat and oats. Your level is detectable but not alarming. Eating organic helps reduce exposure.',
    // Cancer screening
    'grail': 'The Grail Galleri test looks for cancer DNA fragments circulating in your blood. "No Cancer Signal Detected" is excellent news — it means no signs of over 50 types of cancer were found.',
    // MRI
    'brain white matter': 'White matter lesions on your MRI are areas where the protective myelin coating on nerve fibers has been damaged (demyelination). This is the hallmark finding in MS. Your doctors are monitoring these closely.',
    'brain demyelinating': 'Demyelinating plaques are areas of nerve damage consistent with MS. The pattern on your MRI — periventricular (near brain ventricles) with callosal-septal involvement — is classic for MS.',
    'coronary calcium': 'Your coronary calcium score of 0 is the best possible result. It means there is NO calcium buildup in your heart arteries — your cardiovascular risk from plaque is very low.',
    'dexa': 'Your DEXA scan shows normal bone density — no osteopenia or osteoporosis. This is important to monitor especially if you ever need steroid treatments.',
  };

  // Try exact match first, then partial match
  if (descriptions[n]) return descriptions[n];
  for (const [key, desc] of Object.entries(descriptions)) {
    if (n.includes(key) || key.includes(n)) return desc;
  }
  return null;
}

/* ── AI Metric Analysis Component ── */
function AiMetricAnalysis({ metricName, metricValue, metricUnit, metricStatus, refLow, refHigh, history }: {
  metricName: string;
  metricValue: string;
  metricUnit: string;
  metricStatus: string;
  refLow: number | null;
  refHigh: number | null;
  history: Array<{ date: string; value: number; status: string | null }>;
}) {
  const { metrics } = useHealthStore();
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cacheKey = `ai-metric-${metricName}-${metricValue}`;

  const fetchAnalysis = useCallback(async () => {
    // Check cache first
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { setAnalysis(cached); setExpanded(true); return; }

    setLoading(true);
    setExpanded(true);

    // Build context: gather related metrics for cross-referencing
    const relatedMetrics = metrics
      .filter(m => m.status !== 'normal' && m.metric_name !== metricName)
      .sort((a, b) => (b.recorded_date ?? '').localeCompare(a.recorded_date ?? ''))
      .slice(0, 20)
      .map(m => `${m.metric_name}: ${m.metric_value} ${m.metric_unit ?? ''} (${m.status}, ${m.body_region}, ${m.recorded_date})`)
      .join('\n');

    const historyStr = history.slice().reverse().slice(0, 8)
      .map(h => `${h.date}: ${h.value} (${h.status})`).join(', ');

    const prompt = `You are a health AI analyzing a lab result for Aristedis Raptis, a 36-year-old male with the following medical background:
- Radiologically isolated syndrome (brain white matter lesions consistent with MS pattern, but no clinical symptoms)
- Active tick-borne infections: Babesia duncani (IgM positive), Bartonella elizabethae (IgG positive), Lyme C6 peptide positive
- Chronic Group A Strep carrier (Anti-DNase B and ASO persistently 2-4x normal)
- GI dysbiosis: persistent H. pylori with antibiotic resistance, elevated Zonulin (leaky gut), Candida, Citrobacter
- History: Wilms tumor age 3, left nephrectomy (single kidney)
- Genetics: COMT AA (slow detoxifier), CYP1A2 CC (slow caffeine metabolizer), high histamine pathway, HLA DQ2.5/DQ8X (celiac risk), MTHFR A1298C heterozygous
- Food sensitivities: HIGH reactivity to casein, cow's milk, wheat, corn, egg yolk

Current metric being analyzed:
**${metricName}: ${metricValue} ${metricUnit}** (Status: ${metricStatus})
Reference range: ${refLow ?? '—'} – ${refHigh ?? '—'} ${metricUnit}
History: ${historyStr || 'No prior readings'}

Other abnormal metrics for context:
${relatedMetrics || 'None available'}

Write a personalized analysis in 3-4 short paragraphs at a 10th grade reading level:
1. WHAT IS THIS TEST? (1-2 sentences, simple language)
2. YOUR RESULT: Is it normal or not? If abnormal, what could be causing it given Ari's specific medical conditions?
3. CONNECTIONS: How does this relate to other findings in his labs? Cross-reference with his infections, autoimmune markers, genetics, or gut health.
4. WHAT TO DO: Any actionable insight or what to discuss with his doctors.

Keep it under 200 words. Be direct and personal — say "your" not "the patient's". No medical jargon without explaining it.`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.3,
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? 'Analysis unavailable.';
      setAnalysis(text);
      sessionStorage.setItem(cacheKey, text);
    } catch {
      setAnalysis('Could not generate analysis. Check your connection.');
    }
    setLoading(false);
  }, [metricName, metricValue, metricUnit, metricStatus, refLow, refHigh, history, metrics, cacheKey]);

  return (
    <div style={{
      marginBottom: '1rem',
      borderRadius: 'var(--radius-md)',
      border: '1px solid rgba(139, 92, 246, 0.15)',
      overflow: 'hidden',
    }}>
      <button
        onClick={expanded && analysis ? () => setExpanded(false) : fetchAnalysis}
        style={{
          width: '100%',
          padding: '0.6rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.06))',
          border: 'none',
          cursor: 'pointer',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--color-primary)',
        }}
      >
        <span style={{ fontSize: '16px' }}>🧠</span>
        {loading ? 'Analyzing with AI...' : expanded ? 'AI Analysis (click to collapse)' : 'Get AI Analysis — personalized to your health'}
        {loading && <span className="spinning" style={{ width: 14, height: 14, border: '2px solid var(--color-divider)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', display: 'inline-block' }} />}
      </button>
      {expanded && analysis && (
        <div style={{
          padding: '0.75rem 1rem',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.7,
          color: 'var(--color-tx-secondary)',
          background: 'var(--color-surface)',
          whiteSpace: 'pre-wrap',
        }}>
          {analysis}
        </div>
      )}
    </div>
  );
}

function LabExplorer() {
  const { metrics } = useHealthStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  // Group metrics by category
  const categoryData = useMemo(() => {
    const data: Record<string, Array<{
      name: string;
      latestValue: string;
      unit: string | null;
      status: string | null;
      date: string;
      refLow: number | null;
      refHigh: number | null;
      history: Array<{ date: string; value: number; status: string | null }>;
      trend: 'up' | 'down' | 'stable' | null;
    }>> = {};

    for (const cat of LAB_CATEGORIES) {
      const catMetrics = metrics.filter(m => cat.regions.includes(m.body_region ?? ''));

      // Group by metric name
      const byName = new Map<string, typeof metrics>();
      for (const m of catMetrics) {
        const arr = byName.get(m.metric_name) ?? [];
        arr.push(m);
        byName.set(m.metric_name, arr);
      }

      data[cat.key] = Array.from(byName.entries()).map(([name, items]) => {
        // Sort by date descending
        const sorted = [...items].sort((a, b) => (b.recorded_date ?? '').localeCompare(a.recorded_date ?? ''));
        const latest = sorted[0];
        const prev = sorted[1];
        let trend: 'up' | 'down' | 'stable' | null = null;
        if (prev) {
          const latVal = Number(latest.metric_value);
          const prevVal = Number(prev.metric_value);
          if (!isNaN(latVal) && !isNaN(prevVal)) {
            const pctChange = ((latVal - prevVal) / Math.abs(prevVal || 1)) * 100;
            trend = pctChange > 3 ? 'up' : pctChange < -3 ? 'down' : 'stable';
          }
        }

        return {
          name,
          latestValue: String(latest.metric_value),
          unit: latest.metric_unit,
          status: latest.status,
          date: latest.recorded_date,
          refLow: latest.ref_range_low,
          refHigh: latest.ref_range_high,
          trend,
          history: sorted.map(m => ({
            date: m.recorded_date,
            value: Number(m.metric_value),
            status: m.status,
          })).reverse(), // chronological for chart
        };
      }).sort((a, b) => {
        // Flagged first, then alphabetical
        const statusOrder: Record<string, number> = { critical: 0, high: 1, low: 2, normal: 3 };
        return (statusOrder[a.status ?? 'normal'] ?? 3) - (statusOrder[b.status ?? 'normal'] ?? 3);
      });
    }
    return data;
  }, [metrics]);

  // Metric detail view with chart
  if (selectedMetric && selectedCategory) {
    const cat = categoryData[selectedCategory] ?? [];
    const metric = cat.find(m => m.name === selectedMetric);
    if (!metric) return null;

    const chartData = metric.history
      .filter(h => !isNaN(h.value))
      .map(h => ({ date: h.date, value: h.value }));

    return (
      <div className="lab-explorer">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMetric(null)} style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} /> Back to {LAB_CATEGORIES.find(c => c.key === selectedCategory)?.label}
        </button>

        <div className="lab-metric-detail">
          <div className="lab-metric-detail-header">
            <h2 style={{ margin: 0 }}>{metric.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                {metric.latestValue} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--color-tx-muted)' }}>{metric.unit}</span>
              </span>
              <span className={`badge badge-${metric.status === 'normal' ? 'success' : metric.status === 'critical' ? 'error' : 'warning'}`}>
                {metric.status}
              </span>
            </div>
          </div>

          {(metric.refLow != null || metric.refHigh != null) && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', margin: '0.25rem 0 1rem' }}>
              Reference range: {metric.refLow ?? '—'} – {metric.refHigh ?? '—'} {metric.unit}
            </p>
          )}

          {(() => {
            const desc = getMetricDescription(metric.name);
            return desc ? (
              <div style={{
                background: 'var(--color-surface-offset)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.65,
                color: 'var(--color-tx-muted)',
                borderLeft: '3px solid var(--color-primary)',
              }}>
                {desc}
              </div>
            ) : null;
          })()}

          <AiMetricAnalysis metricName={metric.name} metricValue={metric.latestValue} metricUnit={metric.unit ?? ''} metricStatus={metric.status ?? 'normal'} refLow={metric.refLow} refHigh={metric.refHigh} history={metric.history} />

          {chartData.length >= 2 ? (
            <div style={{ marginTop: '0.5rem' }}>
              <TrendChart
                data={chartData}
                metricName={metric.name}
                unit={metric.unit ?? ''}
                refRangeLow={metric.refLow ?? undefined}
                refRangeHigh={metric.refHigh ?? undefined}
              />
            </div>
          ) : (
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', padding: '2rem 0', textAlign: 'center' }}>
              Only 1 data point — need more readings for a trend chart.
            </p>
          )}

          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>History</h3>
          <div className="lab-history-table">
            <div className="lab-history-row lab-history-header">
              <span>Date</span>
              <span>Value</span>
              <span>Status</span>
            </div>
            {metric.history.slice().reverse().map((h, i) => (
              <div key={i} className="lab-history-row">
                <span>{formatDate(h.date)}</span>
                <span style={{ fontWeight: 600 }}>{h.value} {metric.unit}</span>
                <span className={`badge badge-${h.status === 'normal' ? 'success' : h.status === 'critical' ? 'error' : 'warning'}`}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Category detail view — show all markers
  if (selectedCategory) {
    const cat = LAB_CATEGORIES.find(c => c.key === selectedCategory);
    const markers = categoryData[selectedCategory] ?? [];

    return (
      <div className="lab-explorer">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCategory(null)} style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} /> Back to categories
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{cat?.icon}</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{cat?.label}</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>{markers.length} markers tracked</p>
          </div>
        </div>

        {markers.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem' }}>
            <Beaker size={40} />
            <p>No lab data in this category yet. Upload reports to populate.</p>
          </div>
        ) : (
          <div className="lab-markers-list">
            {markers.map(m => (
              <button key={m.name} className="lab-marker-card" onClick={() => setSelectedMetric(m.name)}>
                <div className="lab-marker-info">
                  <span className="lab-marker-name">{m.name}</span>
                  <span className="lab-marker-date">{formatDate(m.date)}</span>
                </div>
                <div className="lab-marker-value-section">
                  <span className="lab-marker-value">
                    {m.latestValue} <span className="lab-marker-unit">{m.unit}</span>
                  </span>
                  {m.trend && (
                    <span className={`lab-marker-trend lab-marker-trend-${m.trend}`}>
                      {m.trend === 'up' ? <TrendingUp size={14} /> : m.trend === 'down' ? <TrendingDown size={14} /> : <Minus size={14} />}
                    </span>
                  )}
                  <span className={`badge badge-${m.status === 'normal' ? 'success' : m.status === 'critical' ? 'error' : 'warning'}`}>
                    {m.status}
                  </span>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--color-tx-faint)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Category grid
  return (
    <div className="lab-explorer">
      <div className="lab-categories-grid">
        {LAB_CATEGORIES.map(cat => {
          const markers = categoryData[cat.key] ?? [];
          const flagged = markers.filter(m => m.status === 'high' || m.status === 'critical' || m.status === 'low').length;
          return (
            <button key={cat.key} className="lab-category-card" onClick={() => setSelectedCategory(cat.key)}>
              <div className="lab-category-icon">{cat.icon}</div>
              <div className="lab-category-info">
                <h3>{cat.label}</h3>
                <p>{cat.description}</p>
              </div>
              <div className="lab-category-stats">
                <span className="lab-category-count">{markers.length} markers</span>
                {flagged > 0 && <span className="badge badge-error">{flagged} flagged</span>}
              </div>
              <ChevronRight size={16} style={{ color: 'var(--color-tx-faint)' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ReportsTab = 'documents' | 'labs';

export default function ReportsPage() {
  const { reports, activeMemberId, familyMembers, uploadReport, deleteReport, processReport } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailReport, setDetailReport] = useState<HealthReport | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  // All years collapsed by default except the current year
  const currentYear = new Date().getFullYear().toString();
  const [collapsedYears, setCollapsedYears] = useState<Set<string> | null>(null);
  const [activeTab, setActiveTab] = useState<ReportsTab>('labs');

  const filtered = filterType === 'all' ? reports : reports.filter(r => r.report_type === filterType);

  // Group by year, sorted descending
  const groupedByYear = useMemo(() => {
    const groups: Record<string, HealthReport[]> = {};
    for (const r of filtered) {
      const year = getReportYear(r);
      if (!groups[year]) groups[year] = [];
      groups[year].push(r);
    }
    // Sort years descending
    const sorted = Object.entries(groups).sort((a, b) => {
      if (a[0] === 'Unknown') return 1;
      if (b[0] === 'Unknown') return -1;
      return parseInt(b[0]) - parseInt(a[0]);
    });
    return sorted;
  }, [filtered]);

  // Initialize collapsed state once we have data
  const effectiveCollapsed = useMemo(() => {
    if (collapsedYears !== null) return collapsedYears;
    // Default: collapse everything except current year
    const allYears = groupedByYear.map(([y]) => y);
    return new Set(allYears.filter(y => y !== currentYear));
  }, [collapsedYears, groupedByYear, currentYear]);

  const toggleYear = (year: string) => {
    const base = effectiveCollapsed;
    const next = new Set(base);
    if (next.has(year)) next.delete(year);
    else next.add(year);
    setCollapsedYears(next);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'imaging': return '🩻';
      case 'lab_results':
      case 'blood_test':
      case 'lab_panel': return '🩸';
      case 'stool_test': return '🧫';
      case 'genetic': return '🧬';
      case 'specialty': return '🔬';
      case 'doctor_notes': return '📋';
      default: return '📄';
    }
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Medical Reports</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s medical documents & reports` : 'Select a family member'}
          </p>
        </div>
        {activeTab === 'documents' && (
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)} disabled={!activeMemberId}>
            <Upload size={14} /> Upload Reports
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="reports-tab-bar">
        <button
          className={`reports-tab${activeTab === 'documents' ? ' active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <FileText size={15} />
          <span>Documents</span>
          <span className="reports-tab-count">{reports.length}</span>
        </button>
        <button
          className={`reports-tab reports-tab-labs${activeTab === 'labs' ? ' active' : ''}`}
          onClick={() => setActiveTab('labs')}
        >
          <Beaker size={15} />
          <span>Lab Explorer</span>
        </button>
      </div>

      {activeTab === 'labs' ? (
        <LabExplorer />
      ) : (
      <>
      {reports.length > 0 && (
        <div className="filter-bar">
          <select className="select-field" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types ({reports.length})</option>
            {REPORT_TYPES.map(t => {
              const count = reports.filter(r => r.report_type === t.value).length;
              if (count === 0) return null;
              return <option key={t.value} value={t.value}>{t.label} ({count})</option>;
            })}
          </select>
          <span className="filter-count">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h2>{reports.length === 0 ? 'No reports yet' : 'No matching reports'}</h2>
          <p>Upload medical reports (PDF or images) and AI will extract the data automatically.</p>
        </div>
      ) : (
        <div className="report-year-groups">
          {groupedByYear.map(([year, yearReports]) => {
            const isCollapsed = effectiveCollapsed.has(year);
            return (
              <div key={year} className="report-year-group">
                <button className="report-year-header" onClick={() => toggleYear(year)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <Calendar size={14} style={{ opacity: 0.5 }} />
                    <span className="report-year-label">{year}</span>
                  </div>
                  <span className="report-year-count">{yearReports.length} document{yearReports.length !== 1 ? 's' : ''}</span>
                </button>
                {!isCollapsed && (
                  <div className="report-list">
                    {yearReports.map(r => (
                      <div key={r.id} className="report-card" onClick={() => setDetailReport(r)} style={{ cursor: 'pointer' }}>
                        <div className="report-card-header">
                          <span style={{ fontSize: '1.25rem' }}>{getTypeIcon(r.report_type)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="report-card-title">{r.title}</div>
                            <div className="report-card-meta">
                              {r.report_type.replace(/_/g, ' ')} · {formatDate(r.report_date)}
                            </div>
                          </div>
                          {r.processing_status === 'complete' ? (
                            <span className="badge badge-success" title="AI analyzed — data extracted to Lab Explorer">✓ AI Analyzed</span>
                          ) : r.processing_status === 'failed' ? (
                            <span className="badge badge-error">Failed</span>
                          ) : r.processing_status === 'processing' ? (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ animation: 'doctorBounce 1.2s ease-in-out infinite', display: 'inline-block' }}>👨‍⚕️</span> Analyzing...
                            </span>
                          ) : r.processing_status === 'uploaded' ? (
                            <span className="badge badge-muted" title="Document uploaded but not yet analyzed by AI">Uploaded</span>
                          ) : (
                            <span className="badge badge-warning" title="Waiting for AI analysis">Pending</span>
                          )}
                        </div>
                        {r.ai_summary && (
                          <p className="report-card-summary">{r.ai_summary}</p>
                        )}
                        {r.body_regions && r.body_regions.length > 0 && (
                          <div className="report-card-regions">
                            {r.body_regions.map(region => (
                              <span key={region} className="badge badge-primary">{region}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      </>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        memberId={activeMemberId}
        onUpload={uploadReport}
      />

      {detailReport && (
        <ReportDetailModal
          report={detailReport}
          onClose={() => setDetailReport(null)}
          onDelete={(id) => { setDeleteId(id); setDetailReport(null); }}
          onProcess={(id) => { processReport(id); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteReport(deleteId); }}
        title="Delete Report"
        message="This will permanently delete this report and any extracted metrics. This cannot be undone."
      />
    </div>
  );
}

function UploadModal({ open, onClose, memberId, onUpload }: {
  open: boolean;
  onClose: () => void;
  memberId: string | null;
  onUpload: (memberId: string, file: File, title: string, reportType: string, reportDate: string | null) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [reportType, setReportType] = useState('lab_results');
  const [reportDate, setReportDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!memberId || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const { title, type, date } = parseReportFilename(rawName);
      // Use user-selected values as override, otherwise use auto-detected
      const finalType = reportType !== 'lab_results' ? reportType : type;
      const finalDate = reportDate || date;
      await onUpload(memberId, file, title, finalType, finalDate);
      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploading(false);
    setFiles([]);
    setReportDate('');
    setUploadProgress(0);
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Reports">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Files *</label>
          <div
            className="scanner-capture-zone"
            style={{ padding: '1.5rem', minHeight: files.length > 0 ? 'auto' : '120px' }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            {files.length > 0 ? (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}>
                      <FileText size={14} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ color: 'var(--color-tx-faint)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.15rem' }} onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', textAlign: 'center' }}>
                  Click or drop to add more files · {files.length} selected
                </p>
              </div>
            ) : (
              <>
                <Upload size={24} />
                <p style={{ margin: '0.5rem 0 0.25rem' }}>Click or drag files here</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>PDF, JPG, PNG, WEBP, HEIC · Select multiple</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
              multiple
              onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select className="select-field" value={reportType} onChange={e => setReportType(e.target.value)}>
              {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Report Date</label>
            <input type="date" className="input-field" value={reportDate} onChange={e => setReportDate(e.target.value)} />
          </div>
        </div>

        {uploading && (
          <div style={{ margin: '1rem 0', padding: '1.25rem', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem', animation: 'doctorBounce 1.2s ease-in-out infinite' }}>
              {uploadProgress < 40 ? '👨‍⚕️' : uploadProgress < 70 ? '🔬' : uploadProgress < 90 ? '📋' : '✅'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-tx)', marginBottom: '0.25rem' }}>
              {uploadProgress < 40 ? 'Dr. Atlas is receiving your files...' : uploadProgress < 70 ? 'Analyzing documents...' : uploadProgress < 90 ? 'Extracting health data...' : 'Almost done!'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginBottom: '0.75rem' }}>
              {uploadProgress}% complete
            </div>
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg, var(--color-primary), #22d3ee)', borderRadius: '3px', transition: 'width 300ms ease' }} />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={uploading || files.length === 0}>
            {uploading ? `Uploading ${files.length} files...` : `Upload ${files.length || ''} File${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReportDetailModal({ report, onClose, onDelete, onProcess }: {
  report: HealthReport;
  onClose: () => void;
  onDelete: (id: string) => void;
  onProcess: (id: string) => void;
}) {
  return (
    <Modal open={true} onClose={onClose} title={report.title} wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span className="badge badge-muted" style={{ marginRight: '0.5rem' }}>{report.report_type.replace(/_/g, ' ')}</span>
          {report.processing_status === 'complete' ? (
            <span className="badge badge-success">✓ AI Analyzed</span>
          ) : report.processing_status === 'uploaded' ? (
            <span className="badge badge-muted">Uploaded</span>
          ) : report.processing_status === 'failed' ? (
            <span className="badge badge-error">Failed</span>
          ) : (
            <span className="badge badge-warning">Pending</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)' }}>
            {formatDate(report.report_date)}
          </span>
          {report.processing_status !== 'complete' && report.file_url && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onProcess(report.id)}
              disabled={report.processing_status === 'processing'}
            >
              {report.processing_status === 'processing' ? '⏳ Processing...' : '🤖 Analyze with AI'}
            </button>
          )}
          {report.processing_status === 'complete' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onProcess(report.id)}
              title="Re-analyze this report"
            >
              🔄 Re-analyze
            </button>
          )}
        </div>
      </div>

      {report.ai_summary && (
        <div className="section">
          <h3 className="section-title">AI Summary</h3>
          <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--color-tx-muted)' }}>{report.ai_summary}</p>
        </div>
      )}

      {report.body_regions && report.body_regions.length > 0 && (
        <div className="section">
          <h3 className="section-title">Body Regions</h3>
          <div className="restriction-chips">
            {report.body_regions.map(region => (
              <span key={region} className="badge badge-primary">{region}</span>
            ))}
          </div>
        </div>
      )}

      {report.structured_data && Object.keys(report.structured_data).length > 0 && (
        <div className="section">
          <h3 className="section-title">Extracted Data</h3>
          <pre style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-offset)', padding: '1rem', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify(report.structured_data, null, 2)}
          </pre>
        </div>
      )}

      {report.file_url && (
        <div className="section">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <a href={report.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <Eye size={14} /> Open in New Tab
            </a>
          </div>
          {report.file_url.endsWith('.pdf') || report.file_mime_type === 'application/pdf' ? (
            <iframe
              src={report.file_url}
              style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 'var(--radius-md)' }}
              title={report.title}
            />
          ) : report.file_url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
            <img src={report.file_url} alt={report.title} style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)' }} />
          ) : null}
        </div>
      )}

      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-danger" onClick={() => onDelete(report.id)}>
          <Trash2 size={14} /> Delete Report
        </button>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
