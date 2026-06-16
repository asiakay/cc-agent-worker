import { GoogleGenAI } from "@google/genai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function text(body, status = 200) {
  return new Response(body, { status, headers: CORS_HEADERS });
}

/**
 * Build the system instruction for the licensing consultant persona.
 * Pulled into its own function so tests can verify the prompt content
 * independently of the full request pipeline.
 */
export function buildSystemInstruction() {
  return `
You are an expert cannabis licensing consultant specializing in Massachusetts adult-use cultivator license applications governed by the Cannabis Control Commission (CCC).

Your role is to brainstorm ideas, structure sections, and draft professional
compliance text, standard operating procedures (SOPs), and operational
narratives based on the operator's notes. Always maintain a formal,
submission-ready regulatory tone and format aligned with 935 CMR 500.000.

Guidelines:
- Use numbered and lettered sub-sections matching CCC application templates.
- Define all acronyms on first use.
- Reference specific CMR subsections where directly applicable.
- Flag any assumption you make about the facility that the applicant should
  verify before submission.
`.trim();
}

/**
 * Build the user-facing prompt for a specific application section.
 */
export function buildPrompt(sectionName, task) {
  return `
Target Application Section: "${sectionName}"
Operator Notes / Strategy: ${task}

Produce a comprehensive, submission-ready draft for this section. Flesh out
operational details, include relevant regulatory citations, and clearly mark
any [OPERATOR TO CONFIRM] placeholders where site-specific details are needed.
`.trim();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health-check endpoint
    if (request.method === "GET") {
      return json({
        status: "ok",
        service: "cc-agent-worker",
        description:
          "POST JSON with { sectionName, task } to generate a license application draft.",
      });
    }

    if (request.method !== "POST") {
      return text("Only GET and POST requests are supported.", 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON." }, 400);
    }

    const { task, sectionName } = body ?? {};

    if (!sectionName || typeof sectionName !== "string" || !sectionName.trim()) {
      return json({ error: 'Missing or empty required field: "sectionName".' }, 400);
    }
    if (!task || typeof task !== "string" || !task.trim()) {
      return json({ error: 'Missing or empty required field: "task".' }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      return json(
        { error: "GEMINI_API_KEY secret is not configured on this Worker." },
        500
      );
    }

    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: buildPrompt(sectionName, task) }] }],
        config: {
          systemInstruction: buildSystemInstruction(),
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      });

      const generatedDraft = response.text;

      if (!generatedDraft) {
        return json({ error: "Gemini returned an empty response." }, 502);
      }

      let savedToKV = false;
      if (env.APPLICATION_DRAFTS) {
        const kvKey = sectionName.trim().toLowerCase().replace(/\s+/g, "-");
        const record = JSON.stringify({
          sectionName,
          draft: generatedDraft,
          savedAt: new Date().toISOString(),
        });
        await env.APPLICATION_DRAFTS.put(kvKey, record);
        savedToKV = true;
      }

      return json({
        success: true,
        section: sectionName,
        savedToKV,
        draft: generatedDraft,
      });
    } catch (err) {
      // Surface the message but never leak stack traces
      return json({ error: err.message ?? "Internal server error." }, 500);
    }
  },
};
