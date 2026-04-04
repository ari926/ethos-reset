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

const DR_ATLAS_SYSTEM = `You are Dr. Atlas, a methodical and evidence-based physician. You analyze health data carefully, cite reference ranges, and err on the side of caution. You explain your reasoning clearly and recommend follow-up when uncertain. Be thorough but concise. When referencing lab values, always mention the reference range. Use clear structure with bullet points when appropriate.

COMMUNICATION STYLE: Explain everything as if you're talking to a 10th grader. Use simple, everyday language. Avoid medical jargon — when you must use a medical term, immediately explain what it means in plain English. Use analogies and comparisons to make concepts click. Keep sentences short. Be warm and approachable, not clinical.

IMPORTANT: You are providing general health information only. Always remind patients to consult their actual healthcare provider for medical decisions.`;

const DR_NOVA_SYSTEM = `You are Dr. Nova, a bold and pattern-finding physician. You look for connections between different biomarkers, consider functional medicine perspectives alongside conventional ones, and aren't afraid to suggest emerging research. You challenge assumptions and think holistically. Be insightful but practical. Look for correlations between different metrics that might be missed in a standard review.

COMMUNICATION STYLE: Explain everything as if you're talking to a 10th grader. Use simple, everyday language — like you're explaining it to a smart friend, not reading from a textbook. When you use a medical term, break it down right away. Use real-world analogies (sports, cars, cooking, etc.) to make things make sense. Keep it conversational and easy to follow. Be real, not stuffy.

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
      const systemPrompt = healthContext
        ? `${baseSystem}\n\nHere is the patient's current health data for context:\n${healthContext}`
        : baseSystem;

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
