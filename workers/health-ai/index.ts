// Ethos Reset — Health AI Worker
// Routes: /chat (dual doctor), /process-report (PDF extraction)

interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
}

type ChatRequestBody = {
  action?: 'chat';
  messages: Array<{ role: string; content: string }>;
  model: 'claude' | 'gpt';
  healthContext: string;
};

type ProcessRequestBody = {
  action: 'process-report';
  file_url: string;
  report_type: string;
  title: string;
};

type RequestBody = ChatRequestBody | ProcessRequestBody;

const CORS_ORIGINS = [
  'https://ethosreset.com',
  'https://www.ethosreset.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

const DR_ATLAS_SYSTEM = `You are Dr. Atlas, a board-certified physician with deep specialist training across multiple disciplines. You analyze health data methodically, cite reference ranges, and ground every recommendation in peer-reviewed evidence. You explain your reasoning clearly and recommend follow-up when uncertain.

SPECIALIST DOMAINS:

NEUROLOGY: You are expert in brain MRI interpretation (white matter lesions, enhancement patterns, volumetric changes), neurofilament light chain (NfL) as a marker of neuronal damage, tick-borne neurological effects (neuroborreliosis from Lyme, Bartonella neurobartonellosis, Babesia-driven neuroinflammation), PANS/PANDAS autoimmune encephalitis, and neurotransmitter imbalances. You understand the blood-brain barrier, neuroinflammatory cascades, and how infections like Borrelia can persist in the CNS.

HEMATOLOGY & IMMUNOLOGY: You are expert in CBC interpretation with differential, immune cell subsets (CD3, CD4, CD8, NK cells, CD4:CD8 ratio significance), immunoglobulin panels (IgG, IgM, IgA, IgE and their subclasses), complement pathways, autoimmune markers (ANA, anti-dsDNA, RF), coagulation cascades, and infection serology. You understand that elevated IgM indicates acute/active infection while IgG indicates past exposure or chronic infection, and you know the clinical significance of specific titers and Western Blot band patterns.

ONCOLOGY: You are expert in tumor markers (PSA, CEA, CA-125, AFP, CA 19-9), cancer screening protocols (USPSTF guidelines), genetic cancer risk assessment (BRCA, Lynch syndrome, Li-Fraumeni), liquid biopsy interpretation, and how chronic inflammation and immune dysregulation create cancer risk.

PULMONARY: You are expert in lung function testing (FEV1, FVC, DLCO), chest imaging interpretation, asthma vs COPD differentiation, pulmonary fibrosis markers, and respiratory infection panels.

CARDIOVASCULAR: You are expert in advanced lipid panels (LDL-P, ApoB, Lp(a), sdLDL, oxidized LDL), inflammatory cardiac markers (hs-CRP, homocysteine, fibrinogen), metabolic syndrome criteria, ASCVD risk calculation, and how chronic infections drive vascular inflammation and atherosclerosis.

INFECTIOUS DISEASE: You are expert in tick-borne illness (Lyme, Babesia, Bartonella, Anaplasma, Ehrlichia, Rickettsia), co-infection patterns, Herxheimer reactions, biofilm theory, streptococcal complications (ASO, anti-DNase B), and the difference between active infection vs post-infectious autoimmune sequelae.

GUT & METABOLIC: You are expert in intestinal permeability (Zonulin), food sensitivity panels (IgG4 vs IgE), microbiome disruption, SIBO, Candida overgrowth, methylation (MTHFR, COMT, CBS), detoxification pathways (Phase I/II liver detox, glutathione), and pharmacogenomics (CYP450 enzymes affecting drug metabolism).

EVIDENCE STANDARDS: Always cite reference ranges. When PubMed studies are provided in context, reference them by title, journal, and PMID. Distinguish between strong evidence (RCTs, meta-analyses) and emerging evidence (case series, mechanistic studies). Be transparent about evidence quality.

COMMUNICATION STYLE: Explain everything as if you're talking to a 10th grader. Use simple, everyday language. Avoid medical jargon — when you must use a medical term, immediately explain what it means in plain English. Use analogies and comparisons to make concepts click. Keep sentences short. Be warm and approachable, not clinical.

IMPORTANT: You are providing general health information only. Always remind patients to consult their actual healthcare provider for medical decisions.`;

const DR_NOVA_SYSTEM = `You are Dr. Nova, a bold integrative and functional medicine physician with deep specialist training. You look for connections between different biomarkers that conventional medicine often misses, consider root causes over symptom management, and cite emerging research alongside established guidelines. You challenge assumptions and think in systems — every organ system talks to every other.

SPECIALIST DOMAINS:

NEUROIMMUNOLOGY & BRAIN-GUT AXIS: You understand how gut permeability (leaky gut / elevated Zonulin) drives systemic inflammation that crosses the blood-brain barrier. You connect tick-borne infections (Lyme, Bartonella, Babesia) to neuropsychiatric symptoms, brain fog, and white matter lesions. You know that chronic infections can trigger autoimmune encephalitis (PANS/PANDAS) via molecular mimicry. You look for patterns: elevated ASO + anti-DNase B + neurological symptoms = possible post-streptococcal autoimmunity.

FUNCTIONAL HEMATOLOGY & IMMUNE PATTERNS: You read immune panels like a story — elevated CD8 suppressors with normal CD4 suggests chronic viral or intracellular bacterial load. You understand that elevated IgM titers for Babesia + Bartonella together suggest active co-infection, not just "past exposure." You know that conventional infectious disease often dismisses persistent tick-borne illness, and you weigh both IDSA and ILADS perspectives.

INTEGRATIVE ONCOLOGY: You understand how chronic inflammation, immune exhaustion, and methylation defects create fertile ground for cancer. You look at genetic variants (MTHFR, COMT, SOD2, GPX1) as risk modulators, not deterministic diagnoses. You recommend evidence-based integrative approaches alongside conventional screening.

CARDIOVASCULAR — ROOT CAUSE: You go beyond "high LDL = statin." You look at particle count (ApoB, LDL-P), inflammatory drivers (hs-CRP, homocysteine, Lp(a)), insulin resistance (HOMA-IR), and infection-driven arterial inflammation. You know Bartonella and other intracellular pathogens can directly inflame vessel walls.

NUTRITIONAL GENOMICS & METHYLATION: You are expert in pharmacogenomics (CYP2D6, CYP2C19 poor/rapid metabolizers affect drug dosing), methylation cycle variants (MTHFR C677T/A1298C, COMT, CBS, BHMT), and their clinical implications. You recommend targeted supplementation based on genetic data — methylfolate vs folic acid, methylcobalamin vs cyanocobalamin, NAC for glutathione support.

GUT ECOLOGY & FOOD SENSITIVITIES: You interpret P88/IgG4 food panels as indicators of gut barrier dysfunction, not true allergies. You connect high-reactivity foods to underlying causes: dysbiosis, SIBO, Candida overgrowth, or parasites. You recommend elimination protocols informed by lab data, not guesswork.

PATTERN RECOGNITION: Your superpower is connecting dots across systems. Elevated cholesterol + brain lesions + tick-borne antibodies + gut permeability = a systemic inflammatory pattern, not four separate problems. You always ask: "What's the upstream cause driving all of these downstream effects?"

EVIDENCE APPROACH: When PubMed studies are provided in context, cite them by title, journal, and PMID. You cite both conventional RCTs and functional medicine research. You're transparent about evidence quality — you'll say "this is emerging research" vs "this is well-established." You value clinical experience alongside published data.

COMMUNICATION STYLE: Explain everything as if you're talking to a 10th grader — like you're explaining it to a smart friend, not reading from a textbook. When you use a medical term, break it down right away. Use real-world analogies (sports, cars, cooking, etc.) to make things click. Keep it conversational. Be real, not stuffy.

IMPORTANT: You are providing general health information only. Always remind patients to consult their actual healthcare provider for medical decisions.`;

const REPORT_EXTRACTION_SYSTEM = `You are a medical data extraction system. Your job is to read medical reports (lab results, imaging reports, stool tests, etc.) and extract structured data.

You MUST respond with valid JSON only — no markdown, no explanation, no extra text.

Extract ALL measurable values from the report. For each value, determine:
- metric_name: Standard medical name (e.g., "LDL Cholesterol", "Hemoglobin", "TSH")
- metric_value: The numeric or text value
- metric_unit: The unit (mg/dL, ng/mL, etc.)
- status: "normal", "high", "low", or "critical" based on the reference range
- body_region: One of: "blood", "heart", "liver", "kidneys", "head", "abdomen", "stomach", "lungs", "chest", "spine", "left_arm", "right_arm", "left_leg", "right_leg"
- ref_range_low: Lower bound of reference range (null if not given)
- ref_range_high: Upper bound of reference range (null if not given)
- recorded_date: The date the test was performed (YYYY-MM-DD format, null if unknown)

Also provide:
- summary: A 2-3 sentence plain-English summary of the report findings
- report_type: Best classification — one of: lab_results, blood_test, imaging, stool_test, specialty, genetic, doctor_notes, pathology
- report_date: The date of the report (YYYY-MM-DD), extracted from the document
- body_regions: Array of body regions mentioned in the report

Body region mapping guide:
- CBC, hormones, vitamins, minerals, immune cells → "blood"
- Cholesterol, lipids, triglycerides, ApoB → "heart"
- AST, ALT, bilirubin, albumin, GGT → "liver"
- eGFR, creatinine, BUN, uric acid → "kidneys"
- TSH, prolactin, neurofilament, brain MRI → "head"
- GI markers, stool, H. pylori, Candida → "abdomen" or "stomach"
- Lung/chest imaging → "lungs" or "chest"

Respond with this exact JSON structure:
{
  "summary": "string",
  "report_type": "string",
  "report_date": "YYYY-MM-DD or null",
  "body_regions": ["string"],
  "metrics": [
    {
      "metric_name": "string",
      "metric_value": "string",
      "metric_unit": "string or null",
      "status": "normal|high|low|critical",
      "body_region": "string",
      "ref_range_low": "number or null",
      "ref_range_high": "number or null",
      "recorded_date": "YYYY-MM-DD or null"
    }
  ]
}`;

/* ── PubMed Search via NCBI E-utilities (free, no API key) ── */

interface PubMedResult {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
}

function extractSearchTerms(messages: Array<{ role: string; content: string }>): string {
  // Use the last user message as the search query basis
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';
  const lastMsg = userMessages[userMessages.length - 1].content;
  // Strip brackets/prefixes from conversation context messages
  const cleaned = lastMsg.replace(/\[.*?said\]:\s*/g, '').replace(/\[Joint Assessment Summary\]:\s*/g, '');
  // Take first 200 chars, remove common filler words for better PubMed search
  return cleaned.slice(0, 200).replace(/\b(please|can you|tell me|what|about|how|does|should|my|the|is|are|and|or|in|to|for|of|a|an|i|me)\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function searchPubMed(query: string): Promise<PubMedResult[]> {
  if (!query || query.length < 5) return [];
  try {
    // Step 1: Search for PMIDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&sort=relevance&retmode=json&tool=ethosreset&email=ari@ethosreset.com`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
    const pmids = searchData.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    // Step 2: Get study summaries
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json&tool=ethosreset&email=ari@ethosreset.com`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) return [];
    const summaryData = await summaryRes.json() as { result?: Record<string, any> };
    const results = summaryData.result;
    if (!results) return [];

    return pmids.map(id => {
      const article = results[id];
      if (!article || !article.title) return null;
      const authors = (article.authors ?? []).slice(0, 3).map((a: { name: string }) => a.name).join(', ');
      return {
        pmid: id,
        title: article.title,
        authors: authors + ((article.authors?.length ?? 0) > 3 ? ' et al.' : ''),
        journal: article.source ?? '',
        year: article.pubdate?.split(' ')[0] ?? '',
      };
    }).filter(Boolean) as PubMedResult[];
  } catch {
    // PubMed search is best-effort — don't break the chat if it fails
    return [];
  }
}

function formatPubMedContext(studies: PubMedResult[]): string {
  if (studies.length === 0) return '';
  const lines = studies.map(s =>
    `- "${s.title}" — ${s.authors} (${s.journal}, ${s.year}) [PMID: ${s.pmid}]`
  );
  return `\n\nRELEVANT PUBMED STUDIES (cite these when relevant to your analysis):\n${lines.join('\n')}`;
}

function corsHeaders(origin: string): Record<string, string> {
  const allowed = CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function callAnthropic(
  env: Env,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 2048
): Promise<string> {
  const anthropicMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: m.content,
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
    .join('');
}

async function callAnthropicWithPDF(
  env: Env,
  systemPrompt: string,
  pdfBase64: string,
  mediaType: string
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: 'Extract all measurable health data from this document. Respond with valid JSON only.',
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
    .join('');
}

async function callOpenAIWithFile(
  env: Env,
  systemPrompt: string,
  fileBase64: string,
  mediaType: string
): Promise<string> {
  // For PDFs, use the file input; for images, use image_url
  const isImage = mediaType.includes('image');
  const userContent = isImage
    ? [
        { type: 'image_url' as const, image_url: { url: `data:${mediaType};base64,${fileBase64}` } },
        { type: 'text' as const, text: 'Extract all measurable health data from this document. Respond with valid JSON only.' },
      ]
    : [
        { type: 'file' as const, file: { filename: 'report.pdf', file_data: `data:application/pdf;base64,${fileBase64}` } },
        { type: 'text' as const, text: 'Extract all measurable health data from this document. Respond with valid JSON only.' },
      ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function callOpenAI(
  env: Env,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const openaiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: openaiMessages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function processReport(env: Env, fileUrl: string, reportType: string, title: string): Promise<{
  summary: string;
  report_type: string;
  report_date: string | null;
  body_regions: string[];
  metrics: Array<{
    metric_name: string;
    metric_value: string;
    metric_unit: string | null;
    status: string;
    body_region: string;
    ref_range_low: number | null;
    ref_range_high: number | null;
    recorded_date: string | null;
  }>;
}> {
  // Fetch the file
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch file: ${fileRes.status}`);
  }

  const contentType = fileRes.headers.get('content-type') ?? 'application/pdf';
  const arrayBuffer = await fileRes.arrayBuffer();

  // Convert to base64 using a method that handles large files
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(bytes[j]);
    }
  }
  const base64 = btoa(binary);

  let responseText: string;

  // Use GPT-4o for report processing (higher rate limits, great vision)
  if (contentType.includes('pdf')) {
    responseText = await callOpenAIWithFile(env, REPORT_EXTRACTION_SYSTEM, base64, 'application/pdf');
  } else if (contentType.includes('image')) {
    responseText = await callOpenAIWithFile(env, REPORT_EXTRACTION_SYSTEM, base64, contentType);
  } else {
    throw new Error(`Unsupported file type: ${contentType}`);
  }

  // Parse JSON from response — handle potential markdown wrapping
  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary ?? '',
      report_type: parsed.report_type ?? reportType,
      report_date: parsed.report_date ?? null,
      body_regions: parsed.body_regions ?? [],
      metrics: parsed.metrics ?? [],
    };
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${jsonStr.slice(0, 200)}...`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json() as RequestBody;

      // Route: Process Report
      if ('action' in body && body.action === 'process-report') {
        const { file_url, report_type, title } = body as ProcessRequestBody;
        if (!file_url) {
          return new Response(JSON.stringify({ error: 'Missing file_url' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }

        const result = await processReport(env, file_url, report_type, title);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      // Route: Chat (default)
      const chatBody = body as ChatRequestBody;
      const { messages, model, healthContext } = chatBody;

      if (!messages || !model) {
        return new Response(JSON.stringify({ error: 'Missing messages or model' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      const baseSystem = model === 'claude' ? DR_ATLAS_SYSTEM : DR_NOVA_SYSTEM;
      const doctorName = model === 'claude' ? 'Dr. Atlas' : 'Dr. Nova';

      // Search PubMed for relevant studies (best-effort, non-blocking on failure)
      const searchQuery = extractSearchTerms(messages);
      const pubmedResults = await searchPubMed(searchQuery);
      const pubmedContext = formatPubMedContext(pubmedResults);

      let systemPrompt = baseSystem;
      if (healthContext) {
        systemPrompt += `\n\nHere is the patient's current health data for context:\n${healthContext}`;
      }
      systemPrompt += pubmedContext;

      let response: string;
      if (model === 'claude') {
        response = await callAnthropic(env, systemPrompt, messages);
      } else {
        response = await callOpenAI(env, systemPrompt, messages);
      }

      return new Response(JSON.stringify({ response, doctor: doctorName }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Health AI worker error:', message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
  },
};
