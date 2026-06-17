import Anthropic from "@anthropic-ai/sdk";
import { renderUI } from "./ui.js";
import { renderLanding } from "./landing.js";
import { renderAdmin } from "./admin.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html;charset=UTF-8", ...CORS_HEADERS },
  });
}

function text(body, status = 200) {
  return new Response(body, { status, headers: CORS_HEADERS });
}

/* ── Auth helper ── */
const DEMO_TOKEN = "demo";

function isValidToken(token, env) {
  if (!token) return false;
  if (token === DEMO_TOKEN) return true;
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) return true;
  return false;
}

function checkBearer(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (isValidToken(token, env)) return true;
  // Fall back to session cookie so API calls work even when sessionStorage is cleared
  return isValidToken(getSessionCookie(request), env);
}

function getSessionCookie(request) {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function sessionCookieHeader(token) {
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`;
}

/**
 * Build the system instruction for the licensing consultant persona.
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

/**
 * Build prompt for the Executive Summary when called from the matcher flow.
 */
function buildExecSummaryPrompt(licenseType, coopStructure, answers) {
  const answersText = Object.entries(answers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  return `
Target Application Section: "Executive Summary"
License Type: ${licenseType}
Cooperative Structure: ${coopStructure}
Applicant Profile:
${answersText}

Produce a comprehensive, submission-ready Executive Summary for a Massachusetts CCC license application for this cooperative. Include:
1. Business overview and cooperative mission
2. License type and cooperative structure rationale
3. Community benefit and social equity commitments
4. Operational readiness summary
5. Regulatory compliance approach

Mark any [OPERATOR TO CONFIRM] placeholders where site-specific details are needed.
`.trim();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    /* ── GET / → public landing page ── */
    if (request.method === "GET" && path === "/") {
      return html(renderLanding());
    }

    /* ── GET /admin → protected dashboard ── */
    if (request.method === "GET" && path === "/admin") {
      const hasError = url.searchParams.get("error") === "1";
      const sessionToken = getSessionCookie(request);
      const isAuthed = isValidToken(sessionToken, env);
      return html(renderAdmin(hasError, isAuthed));
    }

    /* ── POST /api/auth → token verification ping ── */
    if (request.method === "POST" && path === "/api/auth") {
      const auth = request.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (isValidToken(token, env)) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookieHeader(token),
            ...CORS_HEADERS,
          },
        });
      }
      return json({ error: "Invalid token." }, 401);
    }

    /* ── POST /api/logout → clear session cookie and redirect ── */
    if (request.method === "POST" && path === "/api/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/admin",
          "Set-Cookie": "admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        },
      });
    }

    /* ── POST /api/match → cooperative matcher ── */
    if (request.method === "POST" && path === "/api/match") {
      if (!checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured." }, 500);

      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

      const { answers } = body ?? {};
      if (!answers || typeof answers !== "object") {
        return json({ error: "Missing required field: answers." }, 400);
      }

      const answersText = Object.entries(answers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\n");

      const systemPrompt = `You are a Massachusetts cannabis cooperative licensing advisor with deep expertise in CCC regulations (935 CMR 500.000), cooperative law (M.G.L. c. 157), and social equity programs.

Given an applicant's profile, return EXACTLY 3 ranked license + cooperative structure combinations as a valid JSON array.

Each element must have these exact keys:
- rank: integer 1, 2, or 3
- licenseType: string (e.g. "Adult-Use Cultivator", "Adult-Use Retailer", "Craft Marijuana Cooperative", "Delivery-Only Retailer", "Manufacturer", "Testing Laboratory", "Social Consumption Establishment")
- coopStructure: string (e.g. "Worker Cooperative", "Consumer Cooperative", "Producer Cooperative", "Multi-Stakeholder Cooperative")
- fitScore: integer 0-100
- rationale: string (2-3 sentences explaining why this combination fits this applicant)
- equityNotes: string (1-2 sentences on social equity pathway opportunities or limitations)
- nextSteps: array of exactly 3 short action strings

Return ONLY the JSON array with no markdown fences, no commentary, no preamble.`;

      const userPrompt = `Applicant profile:\n${answersText}\n\nReturn the 3 best license + cooperative structure matches as a JSON array.`;

      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const raw = response.content.find((b) => b.type === "text")?.text ?? "";
        let matches;
        try {
          matches = JSON.parse(raw.trim());
        } catch {
          // Attempt to extract JSON array if model wrapped it anyway
          const m = raw.match(/\[[\s\S]*\]/);
          if (!m) return json({ error: "Model returned unparseable response." }, 502);
          matches = JSON.parse(m[0]);
        }

        return json({ success: true, matches });
      } catch (err) {
        return json({ error: err.message ?? "Internal server error." }, 500);
      }
    }

    /* ── POST /api/draft → authenticated draft generation ── */
    if (request.method === "POST" && path === "/api/draft") {
      if (!checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured." }, 500);

      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

      const { sectionName, task, licenseType, coopStructure, answers } = body ?? {};

      if (!sectionName || typeof sectionName !== "string" || !sectionName.trim()) {
        return json({ error: 'Missing required field: "sectionName".' }, 400);
      }

      // Build prompt: if called from matcher flow (has licenseType), use exec summary prompt
      let userPrompt;
      if (licenseType && coopStructure && answers) {
        userPrompt = buildExecSummaryPrompt(licenseType, coopStructure, answers);
      } else if (task && task.trim()) {
        userPrompt = buildPrompt(sectionName, task);
      } else {
        return json({ error: 'Missing required field: "task" (or licenseType+coopStructure+answers).' }, 400);
      }

      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 16000,
          system: buildSystemInstruction(),
          messages: [{ role: "user", content: userPrompt }],
        });

        const generatedDraft = response.content.find((b) => b.type === "text")?.text;

        if (!generatedDraft) return json({ error: "Claude returned an empty response." }, 502);

        let savedToKV = false;
        if (env.APPLICATION_DRAFTS) {
          const kvKey = sectionName.trim().toLowerCase().replace(/\s+/g, "-");
          await env.APPLICATION_DRAFTS.put(
            kvKey,
            JSON.stringify({ sectionName, draft: generatedDraft, savedAt: new Date().toISOString() })
          );
          savedToKV = true;
        }

        return json({ success: true, section: sectionName, savedToKV, draft: generatedDraft });
      } catch (err) {
        return json({ error: err.message ?? "Internal server error." }, 500);
      }
    }

    /* ── POST / → legacy draft endpoint (backward compat) ── */
    if (request.method === "POST" && path === "/") {
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: "ANTHROPIC_API_KEY secret is not configured on this Worker." }, 500);
      }

      let body;
      try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }

      const { task, sectionName } = body ?? {};

      if (!sectionName || typeof sectionName !== "string" || !sectionName.trim()) {
        return json({ error: 'Missing or empty required field: "sectionName".' }, 400);
      }
      if (!task || typeof task !== "string" || !task.trim()) {
        return json({ error: 'Missing or empty required field: "task".' }, 400);
      }

      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 16000,
          system: buildSystemInstruction(),
          messages: [{ role: "user", content: buildPrompt(sectionName, task) }],
        });

        const generatedDraft = response.content.find((b) => b.type === "text")?.text;

        if (!generatedDraft) return json({ error: "Claude returned an empty response." }, 502);

        let savedToKV = false;
        if (env.APPLICATION_DRAFTS) {
          const kvKey = sectionName.trim().toLowerCase().replace(/\s+/g, "-");
          await env.APPLICATION_DRAFTS.put(
            kvKey,
            JSON.stringify({ sectionName, draft: generatedDraft, savedAt: new Date().toISOString() })
          );
          savedToKV = true;
        }

        return json({ success: true, section: sectionName, savedToKV, draft: generatedDraft });
      } catch (err) {
        return json({ error: err.message ?? "Internal server error." }, 500);
      }
    }

    return text("Not found.", 404);
  },
};
