import { useState, useEffect, useMemo } from 'react';
import { useHealthStore, type Restriction, type HealthMetric } from '../stores/healthStore';
import { ShieldAlert, Plus, Trash2, Edit2, Utensils, Dna, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';
import RestrictionModal from '../components/Restrictions/RestrictionModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';

const QUICK_ADD_PRESETS = [
  'Peanuts', 'Tree Nuts', 'Shellfish', 'Dairy', 'Gluten', 'Eggs', 'Soy',
  'Penicillin', 'Aspirin', 'NSAIDs', 'Sulfa Drugs', 'Latex',
];

type RestrictionsTab = 'manual' | 'food' | 'genetics';

/* ── Food Sensitivity helpers ── */
interface FoodSensitivity {
  food: string;
  value: number;
  unit: string | null;
  level: 'High' | 'Moderate' | 'Low' | 'None';
  date: string;
  testType: string;
}

// Known food names from P88 / Food Zoomer tests
const KNOWN_FOODS = new Set([
  'casein','cow\'s milk','goat\'s milk','egg yolk','egg white','egg albumin','beef','chicken','pork','lamb','turkey',
  'codfish','salmon','tuna','shrimp','crab','lobster','clam','oyster','scallop',
  'wheat','gluten','corn','rice','oat','barley','rye','buckwheat','millet','sorghum',
  'soy','peanut','almond','cashew','walnut','pecan','pistachio','brazil nut','hazelnut','macadamia',
  'broccoli','cauliflower','cabbage','spinach','lettuce','tomato','potato','carrot','celery','cucumber',
  'onion','garlic','mushroom','asparagus','bell pepper','sweet potato','zucchini','peas','green bean','lima bean',
  'apple','banana','blueberry','strawberry','grape','grapes','orange','lemon','pineapple','watermelon','plum','peach','cherry','mango','avocado','coconut',
  'cacao','chocolate','coffee','black pepper','cinnamon','ginger','turmeric','oregano','basil','vanilla',
  'sugar','honey','yeast','brewer\'s yeast','baker\'s yeast',
  'aspergillus mix','candida','aspergillus',
]);

function isFoodMetric(name: string): boolean {
  const lower = name.toLowerCase();
  // Check if it matches known food patterns
  if (KNOWN_FOODS.has(lower)) return true;
  // Check P88/food-specific naming patterns
  if (/igg4|ige\b|c3d\b|zoomer score|immune index/i.test(lower)) return true;
  // Strip suffixes and check
  const stripped = lower.replace(/\s*(igg4?|ige|c3d|zoomer score|score)\s*$/i, '').trim();
  if (KNOWN_FOODS.has(stripped)) return true;
  return false;
}

function classifyFoodReaction(value: number, name: string): 'High' | 'Moderate' | 'Low' | 'None' {
  const lower = name.toLowerCase();
  // Zoomer scores: >2.0 = High, 1.5-2.0 = Moderate, 1.0-1.5 = Low
  if (/zoomer score|score$/i.test(lower)) {
    if (value >= 3) return 'High';
    if (value >= 2) return 'Moderate';
    if (value >= 1) return 'Low';
    return 'None';
  }
  // IgG4: >25 High, 10-25 Moderate, 5-10 Low
  if (/igg4/i.test(lower)) {
    if (value >= 25) return 'High';
    if (value >= 10) return 'Moderate';
    if (value >= 5) return 'Low';
    return 'None';
  }
  // C3d: >5 High, 2-5 Moderate, 0.5-2 Low
  if (/c3d/i.test(lower)) {
    if (value >= 5) return 'High';
    if (value >= 2) return 'Moderate';
    if (value >= 0.5) return 'Low';
    return 'None';
  }
  // IgE: >2 High, 1-2 Moderate, 0.5-1 Low
  if (/ige\b/i.test(lower)) {
    if (value >= 2) return 'High';
    if (value >= 1) return 'Moderate';
    if (value >= 0.5) return 'Low';
    return 'None';
  }
  // Default (status-based from DB)
  if (value >= 25) return 'High';
  if (value >= 15) return 'Moderate';
  if (value >= 10) return 'Low';
  return 'None';
}

/* ── Plain English food explanations ── */
const FOOD_EXPLANATIONS: Record<string, string> = {
  'casein': 'Casein is the main protein in milk and cheese. When your body reacts to casein, it can cause bloating, brain fog, skin issues, and inflammation. This is different from lactose intolerance — your immune system is actually attacking the protein itself.',
  'cow\'s milk': 'Your immune system is reacting to proteins in cow\'s milk. This can cause digestive issues, congestion, skin problems, and joint pain. Even small amounts in processed foods can trigger a response.',
  'goat\'s milk': 'Goat\'s milk shares some proteins with cow\'s milk, so if you react to one, you may react to the other. Consider plant-based alternatives like oat or coconut milk.',
  'egg yolk': 'Egg yolk reactions are often linked to inflammation. Yolks contain different proteins than whites, so you may tolerate one but not the other. This can cause gut irritation and skin issues.',
  'egg white': 'Egg white contains proteins like ovalbumin that your immune system is flagging. This can cause digestive discomfort, skin reactions, and inflammation.',
  'gluten': 'Gluten is a protein in wheat, barley, and rye. Your genetic test also shows HLA DQ2.5/DQ8X — meaning you have the celiac risk genes. Combined with this sensitivity result, avoiding gluten is strongly recommended.',
  'wheat': 'Wheat contains gluten and other proteins your body is reacting to. This can cause bloating, fatigue, brain fog, and intestinal permeability (leaky gut). Your Zonulin levels confirm intestinal permeability.',
  'corn': 'Corn sensitivity can cause inflammation and digestive issues. Corn is hidden in many processed foods as corn syrup, corn starch, and dextrose.',
  'soy': 'Soy contains proteins that mimic hormones in your body. Given your elevated SHBG, reducing soy may help with hormone balance.',
  'almond': 'Your immune system shows a moderate reaction to almonds. Consider rotating with other nuts like walnuts or macadamia, which you don\'t react to.',
  'codfish': 'Your body shows dual reactivity (IgG + C3d) to codfish, meaning both your immune system and complement system are reacting. This is a stronger signal than a single marker.',
  'black pepper': 'Black pepper reactions are uncommon but can contribute to gut inflammation. You may want to substitute with white pepper or other spices.',
  'blueberry': 'A mild reaction to blueberries. These are usually fine in small amounts but may contribute to inflammation if eaten daily in large quantities.',
  'broccoli': 'A mild reaction to broccoli. This cruciferous vegetable is generally very healthy, so consider rotating with other vegetables rather than eliminating entirely.',
  'cauliflower': 'Similar to broccoli, a mild reaction. Rotate with other vegetables to reduce immune burden.',
  'beef': 'A moderate reaction to beef proteins. Consider grass-fed sources which have different protein profiles, or rotate with chicken, fish, or plant proteins.',
  'lima bean': 'Your IgE response to lima beans suggests a true allergic component. Avoid lima beans and watch for cross-reactions with other legumes.',
  'aspergillus mix': 'Aspergillus is a common mold found in coffee, wine, dried fruits, and some grains. Your reaction means your immune system is fighting mold exposure — check your home for mold.',
  'candida': 'Your immune system is reacting to Candida yeast. Combined with your GI-MAP showing Candida overgrowth (5,370 — above the 5,000 limit), this confirms active yeast issues in your gut.',
};

/* ── Plain English gene explanations ── */
const GENE_EXPLANATIONS: Record<string, string> = {
  'comt': 'COMT (Catechol-O-Methyltransferase) breaks down dopamine, adrenaline, and estrogen in your brain. Your AA variant means this enzyme works SLOWLY — so dopamine and stress hormones stay active longer. This makes you more focused and driven, but also more prone to anxiety, sleep issues, and feeling overwhelmed. Avoid supplements with catechols (like green tea extract, quercetin). Magnesium and SAMe can help.',
  'cyp1a2': 'CYP1A2 is the enzyme that processes caffeine in your liver. Your CC variant means you are an ULTRA-SLOW caffeine metabolizer. One cup of coffee stays in your system much longer than most people. Caffeine after noon can wreck your sleep. Limit to 1 cup before 10am, or switch to decaf.',
  'nat2': 'NAT2 processes certain drugs and toxins through your liver. Being a "Slow Acetylator" means medications like certain antibiotics, sulfa drugs, and some pain relievers take longer to clear from your body. Tell your doctors about this — they may need to adjust doses.',
  'cyp2c9': 'CYP2C9 processes common medications including ibuprofen (Advil), naproxen (Aleve), and warfarin (blood thinner). Your variants mean these drugs may be stronger or last longer in your body. Use lower doses of NSAIDs and always inform your doctor.',
  'mthfr': 'MTHFR converts folic acid into its active form (methylfolate) that your body actually uses. Your A1298C heterozygous variant means this process is slightly impaired (~30% reduced). Take methylfolate (not folic acid) and methylcobalamin (active B12). Your Thorne Advanced Nutrients already contains these.',
  'hla': 'HLA DQ2.5/DQ8X means you carry the genetic markers for celiac disease. Combined with your positive wheat/gluten sensitivity tests, this is a strong signal to avoid gluten strictly. Not everyone with these genes develops celiac, but your food tests confirm your body IS reacting.',
  'apoe': 'APOE E3/E3 is the most common and "normal" variant. This means you do NOT have the APOE4 variant linked to increased Alzheimer\'s risk. Your brain health genetics are favorable.',
  'fto': 'FTO is the "obesity gene." Your TT variant is the normal/favorable version — you don\'t have the genetic tendency toward weight gain that some people carry.',
  'fads1': 'FADS1 affects how your body converts plant omega-3s (like flaxseed) into the active forms (EPA/DHA) your brain and heart need. Your TT variant means this conversion is impaired. You MUST get omega-3s from fish oil or algae supplements directly — plant sources alone won\'t be enough.',
  'histamine': 'Your genetic profile shows VERY HIGH histamine overload risk. This means your body produces more histamine than it can break down. Symptoms include headaches, flushing, itchy skin, racing heart, and anxiety. Avoid high-histamine foods: aged cheese, wine, fermented foods, cured meats, and leftovers. Consider DAO enzyme supplements before meals.',
  'caffeine': 'Your CYP1A2 CC genotype makes you an ultra-slow caffeine metabolizer. One coffee can keep you wired for 8+ hours. Limit caffeine intake, especially after morning.',
  'methylation': 'Your methylation pathway has HIGH genetic impact. Methylation is how your body repairs DNA, detoxifies, and processes B vitamins. Support it with methylated B vitamins (methylfolate + methylcobalamin), which your current supplement regimen includes.',
  'glucose': 'Your genetics show HIGH impact on glucose and insulin pathways. This means you\'re more sensitive to blood sugar swings. Eat protein with every meal, avoid refined carbs, and consider intermittent fasting carefully (it can help or hurt depending on timing).',
  'btd': 'BTD gene — you carry one copy of a pathogenic variant for biotinidase deficiency. As a CARRIER, you have no symptoms. But if your partner also carries a BTD variant, your children could be affected. Worth mentioning in family planning.',
  'adipogenesis': 'Your genetics show HIGH impact on fat cell formation (adipogenesis). This means your body may create new fat cells more easily than average. Focus on preventing fat cell growth through consistent exercise and avoiding prolonged caloric surplus.',
  'recovery': 'Your genetics show HIGH impact on recovery from exercise. You may need more rest days between intense workouts than average. Prioritize sleep, protein intake, and anti-inflammatory foods after training.',
  'choline': 'Your genetics indicate HIGH need for choline — a nutrient critical for brain function, liver health, and methylation. Most people don\'t get enough. Eat eggs (if tolerated), liver, or take a choline supplement. Your PEMT gene variant increases your need.',
  'fatty acids': 'Your genetics show VERY HIGH impact on fatty acid metabolism. Combined with your FADS1 variant, this means your body struggles to process certain fats. Take high-quality fish oil (EPA/DHA) directly.',
  'collagen': 'Your COL12A1 variant affects collagen and joint health. You may be more prone to joint injuries and slower connective tissue repair. Consider collagen peptide supplements and joint-supporting exercises.',
};

const FOOD_LEVEL_CONFIG = {
  High: { color: 'var(--color-error)', bg: 'var(--color-error-bg, rgba(239,68,68,0.1))', icon: '🔴', badge: 'error' },
  Moderate: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg, rgba(245,158,11,0.1))', icon: '🟡', badge: 'warning' },
  Low: { color: 'var(--color-info, #3b82f6)', bg: 'var(--color-info-bg, rgba(59,130,246,0.1))', icon: '🔵', badge: 'primary' },
  None: { color: 'var(--color-success)', bg: 'var(--color-success-bg, rgba(34,197,94,0.1))', icon: '🟢', badge: 'success' },
};

/* ── Genetics helpers ── */
interface GeneticInsight {
  gene: string;
  variant: string;
  value: number;
  category: string;
  impact: string;
  date: string;
}

const GENE_CATEGORIES: Record<string, { label: string; icon: string; description: string }> = {
  medication: { label: 'Medication Response', icon: '💊', description: 'How your body processes common medications' },
  nutrient: { label: 'Nutrient Needs', icon: '🥬', description: 'Vitamins and minerals your genes say you need more of' },
  detox: { label: 'Detoxification', icon: '🧹', description: 'How well your body clears toxins and waste products' },
  methylation: { label: 'Methylation & DNA Repair', icon: '🧬', description: 'Genes that affect how your body repairs DNA and processes B vitamins' },
  inflammation: { label: 'Inflammation Risk', icon: '🔥', description: 'Genetic tendencies toward inflammation' },
  cardiovascular: { label: 'Heart & Cardiovascular', icon: '❤️', description: 'Genes that influence heart disease and cholesterol metabolism' },
  metabolism: { label: 'Metabolism & Weight', icon: '⚡', description: 'How your body handles fats, carbs, and energy' },
  other: { label: 'Other Genetic Markers', icon: '🔬', description: 'Additional genetic findings' },
};

function classifyGeneCategory(name: string): string {
  const n = name.toLowerCase();
  if (/cyp|nat2|ugt|sult|gst|nqo1|dpyd|slco|abcb|vkorc/i.test(n)) return 'medication';
  if (/mthfr|mtr|mtrr|comt|bhmt|cbs|shmt/i.test(n)) return 'methylation';
  if (/sod|gpx|cat|nrf2|hmox|nfe2l2/i.test(n)) return 'detox';
  if (/tnf|il-|il1|il6|nfkb|cox|lox/i.test(n)) return 'inflammation';
  if (/apoe|apob|lpa|pcsk9|cetp|lpl|mthfr.*cardio|ace|agt|nos3/i.test(n)) return 'cardiovascular';
  if (/fto|mc4r|pparg|adrb|tcf7l2|adipoq|lepr/i.test(n)) return 'metabolism';
  if (/vdr|bcmo1|fads|slc|mao|dao|hnmt/i.test(n)) return 'nutrient';
  return 'other';
}

/* ── Food Sensitivity Tab ── */
function FoodSensitivityTab({ memberId }: { memberId: string | null }) {
  const [foodData, setFoodData] = useState<FoodSensitivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(['High', 'Moderate', 'Low']));
  const [selectedFood, setSelectedFood] = useState<FoodSensitivity | null>(null);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    // Query P88 food sensitivity metrics and Food Zoomer scores
    // Filter by metric names that are actual foods, not blood markers
    supabase
      .from('health_metrics')
      .select('*')
      .eq('member_id', memberId)
      .order('recorded_date', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const foods: FoodSensitivity[] = data
            .filter((m: HealthMetric) => isFoodMetric(m.metric_name))
            .map((m: HealthMetric) => {
              const val = typeof m.metric_value === 'string' ? parseFloat(m.metric_value) || 0 : Number(m.metric_value) || 0;
              return {
                food: m.metric_name.replace(/\s*(IgG4?|IgE|C3d)\s*$/i, '').trim(),
                value: val,
                unit: m.metric_unit,
                level: classifyFoodReaction(val, m.metric_name),
                date: m.recorded_date,
                testType: /igg4/i.test(m.metric_name) ? 'IgG4' : /ige\b/i.test(m.metric_name) ? 'IgE' : /c3d/i.test(m.metric_name) ? 'C3d' : /zoomer/i.test(m.metric_name) ? 'Zoomer' : 'IgG',
              };
            });
          // Deduplicate: keep highest value per food name
          const foodMap = new Map<string, FoodSensitivity>();
          for (const f of foods) {
            const existing = foodMap.get(f.food);
            if (!existing || f.value > existing.value) {
              foodMap.set(f.food, f);
            }
          }
          setFoodData(Array.from(foodMap.values()));
        }
        setLoading(false);
      });
  }, [memberId]);

  const grouped = useMemo(() => {
    const groups: Record<string, FoodSensitivity[]> = { High: [], Moderate: [], Low: [], None: [] };
    for (const f of foodData) {
      groups[f.level].push(f);
    }
    // Sort each group by value descending
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => b.value - a.value);
    }
    return groups;
  }, [foodData]);

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  if (!memberId) {
    return (
      <div className="empty-state">
        <Utensils size={48} />
        <h2>Select a family member</h2>
        <p>Choose a family member to view their food sensitivity results.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-tx-muted)' }}>Loading food sensitivity data...</div>;
  }

  if (foodData.length === 0) {
    return (
      <div className="empty-state">
        <Utensils size={48} />
        <h2>No food sensitivity data</h2>
        <p>Upload P88 Dietary Antigen Test results in the Reports tab. The AI will extract food sensitivity markers automatically.</p>
      </div>
    );
  }

  const highCount = grouped.High.length;
  const modCount = grouped.Moderate.length;

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap',
      }}>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px' }}>
          <div className="kpi-label">Total Foods Tested</div>
          <div className="kpi-value">{foodData.length}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px', borderLeft: '3px solid var(--color-error)' }}>
          <div className="kpi-label">High Reactivity</div>
          <div className="kpi-value" style={{ color: 'var(--color-error)' }}>{highCount}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px', borderLeft: '3px solid var(--color-warning)' }}>
          <div className="kpi-label">Moderate Reactivity</div>
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>{modCount}</div>
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface-offset)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
        color: 'var(--color-tx-muted)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
      }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          These results come from the P88 Dietary Antigen Test, which measures your immune system's IgG response to specific foods.
          A high reaction does not necessarily mean you are allergic — it indicates your immune system is reacting to that food,
          which may cause inflammation. Consider an elimination diet for high-reactivity foods and discuss results with your doctor.
        </span>
      </div>

      {/* Grouped food lists */}
      {(['High', 'Moderate', 'Low', 'None'] as const).map(level => {
        const foods = grouped[level];
        if (foods.length === 0) return null;
        const config = FOOD_LEVEL_CONFIG[level];
        const isExpanded = expandedLevels.has(level);

        return (
          <div key={level} style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => toggleLevel(level)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.75rem 1rem',
                background: config.bg,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-tx)',
                textAlign: 'left',
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{config.icon}</span>
              <span>{level} Reactivity</span>
              <span className={`badge badge-${config.badge}`} style={{ marginLeft: 'auto' }}>
                {foods.length} food{foods.length !== 1 ? 's' : ''}
              </span>
            </button>
            {isExpanded && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.5rem',
                padding: '0.75rem 0.5rem',
              }}>
                {foods.map(f => (
                  <button
                    key={f.food}
                    onClick={() => setSelectedFood(f)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--color-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-divider)',
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'border-color 200ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-divider)')}
                  >
                    <span style={{ fontWeight: 500 }}>{f.food}</span>
                    <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)' }}>
                      {f.value} {f.unit ?? 'U/mL'} · {f.testType}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Food Detail Modal */}
      {selectedFood && (
        <Modal open={true} onClose={() => setSelectedFood(null)} title={`${selectedFood.food}`}>
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div className="kpi-label">Reactivity Level</div>
                <div className="kpi-value" style={{ color: FOOD_LEVEL_CONFIG[selectedFood.level].color }}>{selectedFood.level}</div>
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div className="kpi-label">Value</div>
                <div className="kpi-value">{selectedFood.value}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>{selectedFood.unit ?? 'U/mL'} ({selectedFood.testType})</div>
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div className="kpi-label">Test Date</div>
                <div className="kpi-value" style={{ fontSize: 'var(--text-md)' }}>{formatDate(selectedFood.date)}</div>
              </div>
            </div>

            <div style={{
              background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)',
              padding: '1rem 1.25rem', marginBottom: '1rem',
            }}>
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📖 What does this mean for you?
              </h4>
              <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--color-tx-muted)' }}>
                {FOOD_EXPLANATIONS[selectedFood.food.toLowerCase()] ??
                  `Your immune system shows a ${selectedFood.level.toLowerCase()} reaction to ${selectedFood.food}. ` +
                  (selectedFood.level === 'High' ? `This means your body is actively fighting this food — eating it regularly can cause inflammation, digestive issues, brain fog, and fatigue. Consider eliminating it for 3-6 months, then retest.` :
                   selectedFood.level === 'Moderate' ? `This means your body has a noticeable immune response to this food. Try rotating it (eat no more than once every 4 days) to reduce the immune burden.` :
                   selectedFood.level === 'Low' ? `This is a mild reaction. You can likely eat this food occasionally without issues, but avoid eating it daily.` :
                   `No significant reaction detected. This food is likely safe for you.`)
                }
              </p>
            </div>

            {selectedFood.level === 'High' && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem',
                fontSize: 'var(--text-sm)', color: 'var(--color-tx)',
              }}>
                ⚠️ <strong>Recommendation:</strong> Eliminate this food for at least 3-6 months, then retest to see if your immune response has calmed down.
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Genetics Tab ── */
function GeneticsTab({ memberId }: { memberId: string | null }) {
  const [geneData, setGeneData] = useState<GeneticInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['medication', 'methylation', 'nutrient']));
  const [selectedGene, setSelectedGene] = useState<GeneticInsight | null>(null);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    // Query metrics from genetic/pharmacogenomic reports
    // These typically have source containing '3x4', 'genetic', 'pharmacogenom'
    // or body_region = 'genetic'
    supabase
      .from('health_metrics')
      .select('*')
      .eq('member_id', memberId)
      .or('source.ilike.%3x4%,source.ilike.%genetic%,source.ilike.%pharmaco%,body_region.eq.genetic')
      .order('metric_name', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const insights: GeneticInsight[] = data.map((m: HealthMetric) => ({
            gene: m.metric_name,
            variant: m.metric_unit ?? '',
            value: Number(m.metric_value),
            category: classifyGeneCategory(m.metric_name),
            impact: m.status ?? 'normal',
            date: m.recorded_date,
          }));
          setGeneData(insights);
        }
        setLoading(false);
      });
  }, [memberId]);

  const grouped = useMemo(() => {
    const groups: Record<string, GeneticInsight[]> = {};
    for (const g of geneData) {
      if (!groups[g.category]) groups[g.category] = [];
      groups[g.category].push(g);
    }
    return groups;
  }, [geneData]);

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!memberId) {
    return (
      <div className="empty-state">
        <Dna size={48} />
        <h2>Select a family member</h2>
        <p>Choose a family member to view their genetic insights.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-tx-muted)' }}>Loading genetic data...</div>;
  }

  if (geneData.length === 0) {
    return (
      <div className="empty-state">
        <Dna size={48} />
        <h2>No genetic data</h2>
        <p>Upload 3x4 Genetics or pharmacogenomics test results in the Reports tab. The AI will extract gene variants and actionable insights automatically.</p>
      </div>
    );
  }

  const impactful = geneData.filter(g => g.impact === 'high' || g.impact === 'critical').length;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px' }}>
          <div className="kpi-label">Gene Variants Analyzed</div>
          <div className="kpi-value">{geneData.length}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px' }}>
          <div className="kpi-label">Categories</div>
          <div className="kpi-value">{Object.keys(grouped).length}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px', borderLeft: '3px solid var(--color-warning)' }}>
          <div className="kpi-label">Notable Variants</div>
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>{impactful}</div>
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface-offset)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
        color: 'var(--color-tx-muted)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
      }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          These results come from pharmacogenomic and genetic testing (e.g. 3x4 Genetics).
          Gene variants affect how your body processes medications, nutrients, and toxins.
          Having a variant does not mean you will develop a condition — it indicates a tendency.
          Always discuss genetic results with your healthcare provider before making changes.
        </span>
      </div>

      {/* Category groups */}
      {Object.entries(GENE_CATEGORIES).map(([catKey, catInfo]) => {
        const items = grouped[catKey];
        if (!items || items.length === 0) return null;
        const isExpanded = expandedCats.has(catKey);
        const flagged = items.filter(i => i.impact === 'high' || i.impact === 'critical').length;

        return (
          <div key={catKey} style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => toggleCat(catKey)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'var(--color-surface-offset)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-tx)',
                textAlign: 'left',
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{catInfo.icon}</span>
              <div style={{ flex: 1 }}>
                <div>{catInfo.label}</div>
                <div style={{ fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>{catInfo.description}</div>
              </div>
              <span className="badge badge-muted">{items.length}</span>
              {flagged > 0 && <span className="badge badge-warning">{flagged} notable</span>}
            </button>
            {isExpanded && (
              <div style={{ padding: '0.75rem 0.5rem' }}>
                {items.map(g => (
                  <button
                    key={g.gene + g.date}
                    onClick={() => setSelectedGene(g)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.75rem',
                      borderBottom: '1px solid var(--color-divider)',
                      fontSize: 'var(--text-sm)',
                      background: 'none',
                      border: 'none',
                      borderBottomStyle: 'solid',
                      borderBottomWidth: '1px',
                      borderBottomColor: 'var(--color-divider)',
                      width: '100%',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 200ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-offset)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {g.impact === 'critical' ? (
                        <AlertTriangle size={14} style={{ color: 'var(--color-error)' }} />
                      ) : g.impact === 'high' ? (
                        <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                      ) : (
                        <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                      )}
                      <span style={{ fontWeight: 600 }}>{g.gene}</span>
                      {g.variant && <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)' }}>({g.variant})</span>}
                    </div>
                    <span className={`badge badge-${g.impact === 'normal' ? 'success' : g.impact === 'critical' ? 'error' : 'warning'}`}>
                      {g.impact}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Gene Detail Modal */}
      {selectedGene && (
        <Modal open={true} onClose={() => setSelectedGene(null)} title={selectedGene.gene}>
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div className="kpi-card" style={{ flex: 1, minWidth: '120px' }}>
                <div className="kpi-label">Impact</div>
                <div className="kpi-value" style={{ color: selectedGene.impact === 'high' || selectedGene.impact === 'critical' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {selectedGene.impact.charAt(0).toUpperCase() + selectedGene.impact.slice(1)}
                </div>
              </div>
              {selectedGene.variant && (
                <div className="kpi-card" style={{ flex: 1, minWidth: '120px' }}>
                  <div className="kpi-label">Your Variant</div>
                  <div className="kpi-value" style={{ fontSize: 'var(--text-md)' }}>{selectedGene.variant}</div>
                </div>
              )}
              <div className="kpi-card" style={{ flex: 1, minWidth: '120px' }}>
                <div className="kpi-label">Category</div>
                <div className="kpi-value" style={{ fontSize: 'var(--text-md)' }}>
                  {GENE_CATEGORIES[selectedGene.category]?.icon} {GENE_CATEGORIES[selectedGene.category]?.label ?? selectedGene.category}
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)',
              padding: '1rem 1.25rem', marginBottom: '1rem',
            }}>
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📖 What does this mean for you?
              </h4>
              <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--color-tx-muted)' }}>
                {(() => {
                  const key = selectedGene.gene.toLowerCase().replace(/\s.*$/, '');
                  return GENE_EXPLANATIONS[key] ??
                    `${selectedGene.gene} is a gene that affects your ${GENE_CATEGORIES[selectedGene.category]?.label.toLowerCase() ?? 'health'}. ` +
                    (selectedGene.impact === 'high' || selectedGene.impact === 'critical'
                      ? `Your variant has a notable impact — meaning your body handles this pathway differently than most people. Discuss with your doctor how this might affect your treatment plan.`
                      : `Your variant has a normal or low impact — this gene is not a major concern for you.`);
                })()}
              </p>
            </div>

            {(selectedGene.impact === 'high' || selectedGene.impact === 'critical') && (
              <div style={{
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem',
                fontSize: 'var(--text-sm)', color: 'var(--color-tx)',
              }}>
                💡 <strong>Action item:</strong> Share this genetic result with your healthcare provider. It may affect medication choices, supplement needs, or lifestyle recommendations.
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Manual Restrictions Tab (original content) ── */
function ManualRestrictionsTab({
  restrictions,
  activeMemberId,
  onAdd,
  onEdit,
  onDelete,
}: {
  restrictions: Restriction[];
  activeMemberId: string | null;
  onAdd: (item: string) => void;
  onEdit: (r: Restriction) => void;
  onDelete: (id: string) => void;
}) {
  const confirmed = restrictions.filter(r => r.confirmed);
  const suggested = restrictions.filter(r => !r.confirmed);

  return (
    <div>
      {activeMemberId && (
        <div className="section">
          <h3 className="section-title">Quick Add Common Allergens</h3>
          <div className="restriction-chips">
            {QUICK_ADD_PRESETS.map(item => (
              <button
                key={item}
                className="badge badge-muted"
                style={{ cursor: 'pointer' }}
                onClick={() => onAdd(item)}
                disabled={restrictions.some(r => r.item_name === item)}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="section">
          <h3 className="section-title" style={{ color: 'var(--color-warning)' }}>
            AI-Suggested Restrictions ({suggested.length})
          </h3>
          <div className="restriction-list">
            {suggested.map(r => (
              <div key={r.id} className="restriction-item suggested">
                <div className="restriction-info">
                  <span className={`badge badge-${r.severity === 'critical' ? 'error' : 'warning'}`}>{r.restriction_type.replace(/_/g, ' ')}</span>
                  <strong>{r.item_name}</strong>
                  {r.reaction && <span className="restriction-reaction">{r.reaction}</span>}
                </div>
                <div className="restriction-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => {/* confirm */}}>Confirm</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => onDelete(r.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmed.length === 0 && suggested.length === 0 ? (
        <div className="empty-state">
          <ShieldAlert size={48} />
          <h2>No restrictions</h2>
          <p>Add food allergies, drug interactions, or dietary restrictions for this family member.</p>
        </div>
      ) : (
        <div className="restriction-list">
          {confirmed.map(r => (
            <div key={r.id} className="restriction-item">
              <div className="restriction-info">
                <span className={`severity-dot severity-${r.severity}`} />
                <span className="badge badge-muted">{r.restriction_type.replace(/_/g, ' ')}</span>
                <strong>{r.item_name}</strong>
                {r.reaction && <span className="restriction-reaction">{'\u2014'} {r.reaction}</span>}
              </div>
              <div className="restriction-actions">
                <button className="btn btn-sm btn-ghost" onClick={() => onEdit(r)}>
                  <Edit2 size={14} />
                </button>
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-error)' }} onClick={() => onDelete(r.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function RestrictionsPage() {
  const { restrictions, activeMemberId, familyMembers, addRestriction, deleteRestriction } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Restriction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RestrictionsTab>('manual');

  const handleQuickAdd = (item: string) => {
    if (!activeMemberId) return;
    addRestriction({
      member_id: activeMemberId,
      restriction_type: 'food_allergy',
      item_name: item,
      severity: 'warning',
      source: 'manual',
      confirmed: true,
    });
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Restrictions</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s food & medicine restrictions` : 'Select a family member'}
          </p>
        </div>
        {activeTab === 'manual' && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setModalOpen(true); }} disabled={!activeMemberId}>
            <Plus size={14} /> Add Restriction
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="reports-tab-bar">
        <button
          className={`reports-tab${activeTab === 'manual' ? ' active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          <ShieldAlert size={15} />
          <span>Manual</span>
          <span className="reports-tab-count">{restrictions.length}</span>
        </button>
        <button
          className={`reports-tab${activeTab === 'food' ? ' active' : ''}`}
          onClick={() => setActiveTab('food')}
        >
          <Utensils size={15} />
          <span>Food Sensitivities</span>
        </button>
        <button
          className={`reports-tab${activeTab === 'genetics' ? ' active' : ''}`}
          onClick={() => setActiveTab('genetics')}
        >
          <Dna size={15} />
          <span>Genetics</span>
        </button>
      </div>

      {activeTab === 'manual' && (
        <ManualRestrictionsTab
          restrictions={restrictions}
          activeMemberId={activeMemberId}
          onAdd={handleQuickAdd}
          onEdit={(r) => { setEditItem(r); setModalOpen(true); }}
          onDelete={(id) => setDeleteId(id)}
        />
      )}

      {activeTab === 'food' && (
        <FoodSensitivityTab memberId={activeMemberId} />
      )}

      {activeTab === 'genetics' && (
        <GeneticsTab memberId={activeMemberId} />
      )}

      <RestrictionModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        restriction={editItem}
        memberId={activeMemberId}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteRestriction(deleteId); }}
        title="Delete Restriction"
        message="Are you sure you want to remove this restriction?"
      />
    </div>
  );
}
