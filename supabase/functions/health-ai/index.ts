// Health AI Edge Function — processes reports, answers health questions, analyzes scanner images
// Deploy: supabase functions deploy health-ai --project-ref <your-project-ref>
// Secrets needed: CLAUDE_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-action",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "CLAUDE_API_KEY not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const action = req.headers.get("x-action") || "chat";
    const body = await req.json();

    switch (action) {
      case "process-report":
        return await processReport(supabase, apiKey, body);
      case "analyze-scan":
        return await analyzeScan(supabase, apiKey, body);
      case "chat":
        return await healthChat(supabase, apiKey, body, authHeader);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("health-ai error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

// ─── PROCESS REPORT ───
// Extracts structured data, metrics, restrictions from uploaded reports
async function processReport(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  body: { report_id: string; file_url: string; report_type: string; member_id: string }
) {
  const { report_id, file_url, report_type, member_id } = body;

  // Update status to processing
  await supabase
    .from("health_reports")
    .update({ processing_status: "processing" })
    .eq("id", report_id);

  try {
    // Fetch the file content
    const fileResponse = await fetch(file_url);
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    const mimeType = fileResponse.headers.get("content-type") || "application/pdf";

    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf";

    const systemPrompt = `You are a medical report analyzer. Extract structured health data from medical reports.

You MUST respond with valid JSON only. No markdown, no explanation.

JSON schema:
{
  "summary": "2-3 sentence plain-language summary of the report",
  "body_regions": ["array of body regions this report relates to"],
  "metrics": [
    {
      "metric_name": "Name of the metric (e.g. Hemoglobin, WBC, Cholesterol)",
      "metric_value": 12.5,
      "metric_unit": "g/dL",
      "status": "normal|low|high|critical",
      "ref_range_low": 12.0,
      "ref_range_high": 17.5,
      "body_region": "blood|heart|liver|kidneys|lungs|head|chest|abdomen|spine|left_arm|right_arm|left_leg|right_leg"
    }
  ],
  "restrictions": [
    {
      "restriction_type": "food_allergy|food_intolerance|drug_allergy|drug_interaction|dietary|contraindication",
      "item_name": "Name of the restricted item",
      "severity": "critical|warning|caution",
      "reaction": "Description of the reaction or reason"
    }
  ]
}

Body regions for mapping: head, chest, heart, lungs, abdomen, liver, stomach, kidneys, left_arm, right_arm, left_leg, right_leg, spine, blood

For blood tests, use body_region "blood" for general blood metrics, or the specific organ if the metric relates to organ function (e.g. liver enzymes → "liver").

If a metric is outside the reference range, mark it as "high" or "low". If severely outside (>2x deviation), mark as "critical".

Report type: ${report_type}`;

    const content: Array<Record<string, unknown>> = [];

    if (isImage) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      });
      content.push({ type: "text", text: "Extract all health data from this medical report image." });
    } else if (isPdf) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      });
      content.push({ type: "text", text: "Extract all health data from this medical report." });
    } else {
      // Try as text
      const text = new TextDecoder().decode(fileBuffer);
      content.push({ type: "text", text: `Extract all health data from this medical report:\n\n${text}` });
    }

    const claudeResponse = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content?.[0]?.text ?? "";

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");

    const parsed = JSON.parse(jsonMatch[0]);

    // Update the report with AI results
    await supabase
      .from("health_reports")
      .update({
        ai_summary: parsed.summary,
        body_regions: parsed.body_regions,
        structured_data: parsed,
        processing_status: "complete",
      })
      .eq("id", report_id);

    // Insert extracted metrics
    if (parsed.metrics?.length > 0) {
      const metricsToInsert = parsed.metrics.map((m: Record<string, unknown>) => ({
        member_id,
        report_id,
        metric_name: m.metric_name,
        metric_value: m.metric_value,
        metric_unit: m.metric_unit,
        status: m.status,
        ref_range_low: m.ref_range_low,
        ref_range_high: m.ref_range_high,
        body_region: m.body_region,
        recorded_date: new Date().toISOString().split("T")[0],
        source: "report",
      }));

      await supabase.from("health_metrics").insert(metricsToInsert);
    }

    // Insert suggested restrictions
    if (parsed.restrictions?.length > 0) {
      const restrictionsToInsert = parsed.restrictions.map((r: Record<string, unknown>) => ({
        member_id,
        restriction_type: r.restriction_type,
        item_name: r.item_name,
        severity: r.severity,
        reaction: r.reaction,
        source: "ai",
        source_report_id: report_id,
        confirmed: false,
      }));

      await supabase.from("restrictions").insert(restrictionsToInsert);
    }

    return jsonResponse({ success: true, summary: parsed.summary, metrics_count: parsed.metrics?.length ?? 0 });
  } catch (err) {
    console.error("Process report error:", err);
    await supabase
      .from("health_reports")
      .update({ processing_status: "failed" })
      .eq("id", report_id);

    return jsonResponse({ error: (err as Error).message }, 500);
  }
}

// ─── ANALYZE SCAN (food/medicine safety check) ───
async function analyzeScan(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  body: { image_base64: string; mime_type: string; scan_type: string; member_id: string; restrictions: Array<{ item_name: string; severity: string; restriction_type: string; reaction?: string }> }
) {
  const { image_base64, mime_type, scan_type, member_id, restrictions } = body;

  const restrictionList = restrictions
    .map((r) => `- ${r.item_name} (${r.severity}, ${r.restriction_type}${r.reaction ? `, reaction: ${r.reaction}` : ""})`)
    .join("\n");

  const systemPrompt = `You are a ${scan_type === "food" ? "food safety" : "medicine safety"} analyzer for a family health app.

The user has the following restrictions/allergies:
${restrictionList || "(none)"}

Analyze the ${scan_type} in the image. Identify what it is and check ALL ingredients against the user's restrictions.

Respond with valid JSON only:
{
  "item_name": "Name of the food/medicine identified",
  "overall_result": "safe|unsafe|caution",
  "ingredients": ["list", "of", "identified", "ingredients"],
  "flagged": [
    {
      "ingredient": "ingredient name",
      "severity": "critical|warning|caution",
      "reason": "Why this is flagged (e.g. contains peanuts, patient has peanut allergy)"
    }
  ],
  "explanation": "Brief explanation of the safety assessment"
}

Rules:
- "unsafe" = contains a critical-severity restricted item
- "caution" = contains a warning/caution-severity restricted item
- "safe" = no restricted items found
- Always identify the item even if no restrictions match`;

  const claudeResponse = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime_type, data: image_base64 } },
            { type: "text", text: `Analyze this ${scan_type} for safety.` },
          ],
        },
      ],
    }),
  });

  const claudeData = await claudeResponse.json();
  const responseText = claudeData.content?.[0]?.text ?? "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return jsonResponse({ error: "Failed to parse AI response" }, 500);

  const result = JSON.parse(jsonMatch[0]);

  // Save to scan history
  await supabase.from("scan_history").insert({
    member_id,
    scan_type,
    item_name: result.item_name,
    overall_result: result.overall_result,
    ingredients: result.ingredients,
    flagged: result.flagged,
    explanation: result.explanation,
    ai_model: CLAUDE_MODEL,
  });

  return jsonResponse(result);
}

// ─── HEALTH CHAT ───
async function healthChat(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  body: { member_id: string; messages: Array<{ role: string; content: string }>; context?: Record<string, unknown> },
  authHeader: string | null
) {
  const { member_id, messages, context } = body;

  // Fetch member data for context
  const [memberRes, restrictionsRes, metricsRes, vitalsRes, reportsRes] = await Promise.all([
    supabase.from("family_members").select("*").eq("id", member_id).single(),
    supabase.from("restrictions").select("*").eq("member_id", member_id),
    supabase.from("health_metrics").select("*").eq("member_id", member_id).order("recorded_date", { ascending: false }).limit(50),
    supabase.from("vitals").select("*").eq("member_id", member_id).order("recorded_at", { ascending: false }).limit(30),
    supabase.from("health_reports").select("id, title, report_type, report_date, ai_summary, body_regions, processing_status").eq("member_id", member_id).order("report_date", { ascending: false }).limit(10),
  ]);

  const member = memberRes.data;
  const restrictions = restrictionsRes.data ?? [];
  const metrics = metricsRes.data ?? [];
  const vitals = vitalsRes.data ?? [];
  const reports = reportsRes.data ?? [];

  const systemPrompt = `You are a helpful health assistant for a family health tracking app. You have access to the user's health data for ${member?.first_name} ${member?.last_name}.

IMPORTANT DISCLAIMERS:
- You are NOT a doctor. Always recommend consulting a healthcare professional for medical decisions.
- You cannot diagnose conditions or prescribe treatments.
- You CAN explain lab results, provide general health information, and identify trends.

Patient Profile:
- Name: ${member?.first_name} ${member?.last_name}
- DOB: ${member?.date_of_birth || "Unknown"}
- Gender: ${member?.gender || "Unknown"}
- Blood Type: ${member?.blood_type || "Unknown"}
- Height: ${member?.height_cm ? `${member.height_cm} cm` : "Unknown"}
- Weight: ${member?.weight_kg ? `${member.weight_kg} kg` : "Unknown"}

Restrictions (${restrictions.length}):
${restrictions.map((r: Record<string, unknown>) => `- ${r.item_name} (${r.restriction_type}, ${r.severity}${r.reaction ? `, reaction: ${r.reaction}` : ""})`).join("\n") || "None"}

Recent Health Metrics (${metrics.length}):
${metrics.slice(0, 20).map((m: Record<string, unknown>) => `- ${m.metric_name}: ${m.metric_value} ${m.metric_unit || ""} (${m.status || "unknown"}) [${m.body_region || "general"}] — ${m.recorded_date}`).join("\n") || "None"}

Recent Vitals (${vitals.length}):
${vitals.slice(0, 10).map((v: Record<string, unknown>) => `- ${(v.vital_type as string).replace(/_/g, " ")}: ${v.value_primary}${v.value_secondary ? `/${v.value_secondary}` : ""} ${v.unit || ""} — ${v.recorded_at}`).join("\n") || "None"}

Recent Reports (${reports.length}):
${reports.map((r: Record<string, unknown>) => `- ${r.title} (${r.report_type}, ${r.report_date}): ${r.ai_summary || "No summary"}`).join("\n") || "None"}

Respond conversationally but accurately. Cite specific data points when relevant. Keep responses concise but thorough.`;

  const claudeResponse = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  const claudeData = await claudeResponse.json();
  const responseText = claudeData.content?.[0]?.text ?? "I'm sorry, I couldn't process that request.";

  return jsonResponse({ response: responseText });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
