// Ethos Reset — Dual AI Doctor Worker
// Routes requests to Anthropic (Dr. Atlas) or OpenAI (Dr. Nova)

interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
}

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  model: 'claude' | 'gpt';
  healthContext: string;
}

const CORS_ORIGINS = [
  'https://ethosreset.com',
  'https://www.ethosreset.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

const DR_ATLAS_SYSTEM = `You are Dr. Atlas, a methodical and evidence-based physician. You analyze health data carefully, cite reference ranges, and err on the side of caution. You explain your reasoning clearly and recommend follow-up when uncertain. Be thorough but concise. When referencing lab values, always mention the reference range. Use clear structure with bullet points when appropriate.

IMPORTANT: You are providing general health information only. Always remind patients to consult their actual healthcare provider for medical decisions.`;

const DR_NOVA_SYSTEM = `You are Dr. Nova, a bold and pattern-finding physician. You look for connections between different biomarkers, consider functional medicine perspectives alongside conventional ones, and aren't afraid to suggest emerging research. You challenge assumptions and think holistically. Be insightful but practical. Look for correlations between different metrics that might be missed in a standard review.

IMPORTANT: You are providing general health information only. Always remind patients to consult their actual healthcare provider for medical decisions.`;

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
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  // Convert messages to Anthropic format (system is separate)
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
      max_tokens: 2048,
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const headers = corsHeaders(origin);

    // Handle CORS preflight
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
      const { messages, model, healthContext } = body;

      if (!messages || !model) {
        return new Response(JSON.stringify({ error: 'Missing messages or model' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      // Build system prompt with health context
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
