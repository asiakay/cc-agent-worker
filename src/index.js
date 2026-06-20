import Anthropic from "@anthropic-ai/sdk";
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
const SESSION_TTL = 3600; // 1 hour

function toBase64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(s) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

async function signingKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(env) {
  const secret = env.ADMIN_TOKEN || DEMO_TOKEN;
  const key = await signingKey(secret);
  const now = Math.floor(Date.now() / 1000);
  const payloadB64 = toBase64url(
    new TextEncoder().encode(JSON.stringify({ iat: now, exp: now + SESSION_TTL })),
  );
  const sig = toBase64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)));
  return `${payloadB64}.${sig}`;
}

async function verifySessionToken(token, env) {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const secret = env.ADMIN_TOKEN || DEMO_TOKEN;
  try {
    const key = await signingKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(sigB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromBase64url(payloadB64)));
    return Math.floor(Date.now() / 1000) < exp;
  } catch {
    return false;
  }
}

// Accepts raw ADMIN_TOKEN ("demo" or env.ADMIN_TOKEN) — used only for the
// Bearer header so existing API clients don't break. Cookie auth uses signed
// session tokens exclusively.
function isValidRawToken(token, env) {
  if (!token) return false;
  if (token === DEMO_TOKEN) return true;
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) return true;
  return false;
}

function resolveSessionKey(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || getSessionCookie(request);
  // Use first 16 chars of the token as an opaque KV key fragment.
  // This avoids storing the full token as a key while still being session-scoped.
  return token.slice(0, 16) || "anon";
}

async function checkBearer(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (isValidRawToken(bearer, env)) return true;
  if (await verifySessionToken(bearer, env)) return true;
  // Fall back to session cookie (must be a signed session token)
  return verifySessionToken(getSessionCookie(request), env);
}

function getSessionCookie(request) {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function sessionCookieHeader(token) {
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`;
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
 * Build system prompt for the parcel identification report.
 */
function buildParcelSystemPrompt() {
  return `You are a Massachusetts real estate and cannabis zoning specialist with deep knowledge of Massachusetts General Laws Chapter 40A (Zoning Act), CCC regulations (935 CMR 500.000) governing facility siting and buffer zones, MassGIS parcel data, the Massachusetts Interactive Property Map (MassMapper), and municipal assessor databases across all 14 Massachusetts counties. Provide specific, actionable guidance. Cite actual zoning district names (e.g., Industrial A, Business C, Agricultural) where known. Always note with [VERIFY WITH MUNICIPALITY] where current bylaws must be confirmed directly with the host community.`;
}

/**
 * Build user prompt for the parcel identification report.
 */
function buildParcelPrompt(licenseType, coopStructure, answers) {
  const isCultivation = /cultivat|craft marijuana/i.test(licenseType);
  const answersText = Object.entries(answers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  return `
License Type: ${licenseType}
Cooperative Structure: ${coopStructure}
Applicant Profile:
${answersText}

Provide a parcel identification report covering ALL of the following sections:

## 1. Permitted Zoning Districts
List the zoning district types (e.g., Industrial, Light Industrial, Business B, Agricultural) that typically permit ${licenseType} operations in Massachusetts, with notes specific to ${answers.location}.

## 2. Minimum Lot & Building Size
Based on a ${answers.capital} capital range, what minimum lot size (acres) and building square footage should this cooperative target? Provide a realistic range.
${isCultivation ? `
## 3. Canopy Sizing Estimate
At the ${answers.capital} capital level with a ${coopStructure} model, estimate:
- Realistic canopy square footage range
- Total facility footprint needed to support that canopy
- Tiered license class this canopy falls under (Tier 1–11 per 935 CMR 500.002)
` : ""}
## 4. Regulatory Setbacks & Buffer Distances

Return this section as a markdown table with columns:
| Sensitive Use | Required Buffer | Authority / Citation | Notes |

Include rows for: schools (K-12), daycare centers, playgrounds/parks, residential zones, and any other uses mandated by Massachusetts law or typical ${answers.location} municipal bylaws. Populate "Authority / Citation" with the specific statute or CMR subsection (e.g., 935 CMR 500.110(1), M.G.L. c. 94G § 3, or the municipality name if a local bylaw). Add a [VERIFY WITH MUNICIPALITY] note in the Notes column for any distance that varies by host community agreement.

## 5. Cannabis-Friendly Municipalities
Name 2–3 specific towns or cities within or near ${answers.location} that have established cannabis-friendly zoning or approved host community agreements, with a brief note on why each is favorable.

## 6. How to Search for Parcels
Step-by-step instructions for:
- Using MassMapper (https://maps.mass.gov/massmapper/) to filter by zoning district and parcel size in ${answers.location}
- Accessing the relevant county Registry of Deeds or municipal assessor database
- Key search filters to apply (lot size, zoning code, use code)

Mark any [VERIFY WITH MUNICIPALITY] notes where current bylaws must be confirmed directly.
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
      const isAuthed = await verifySessionToken(getSessionCookie(request), env);
      return html(renderAdmin(hasError, isAuthed));
    }

    /* ── POST /api/auth → token verification ping ── */
    if (request.method === "POST" && path === "/api/auth") {
      const auth = request.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (isValidRawToken(token, env)) {
        const sessionToken = await createSessionToken(env);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookieHeader(sessionToken),
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
          "Set-Cookie": "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
        },
      });
    }

    /* ── POST /api/match → cooperative matcher ── */
    if (request.method === "POST" && path === "/api/match") {
      if (!await checkBearer(request, env)) {
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
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
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
        console.error("[/api/match]", err);
        return json({ error: "Internal server error." }, 500);
      }
    }

    /* ── POST /api/draft → authenticated draft generation ── */
    if (request.method === "POST" && path === "/api/draft") {
      if (!await checkBearer(request, env)) {
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
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 16000,
          system: buildSystemInstruction(),
          messages: [{ role: "user", content: userPrompt }],
        });

        const generatedDraft = response.content.find((b) => b.type === "text")?.text;

        if (!generatedDraft) return json({ error: "Claude returned an empty response." }, 502);

        if (env.APPLICATION_DRAFTS) {
          const kvKey = sectionName.trim().toLowerCase().replace(/\s+/g, "-");
          await env.APPLICATION_DRAFTS.put(
            kvKey,
            JSON.stringify({ sectionName, draft: generatedDraft, savedAt: new Date().toISOString() })
          );
        }

        return json({ success: true, section: sectionName, draft: generatedDraft });
      } catch (err) {
        console.error(err);
        return json({ error: "Internal server error." }, 500);
      }
    }

    /* ── POST /api/chat → next-step recommendation chatbot ── */
    if (request.method === "POST" && path === "/api/chat") {
      if (!await checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured." }, 500);

      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

      const { step, matchContext, messages } = body ?? {};
      if (!step || typeof step !== "string") return json({ error: "Missing required field: step." }, 400);
      if (step.length > 300) return json({ error: "Field 'step' exceeds maximum length." }, 400);
      if (!Array.isArray(messages)) return json({ error: "Missing required field: messages." }, 400);

      const contextBlurb = matchContext
        ? `License type: ${matchContext.licenseType}\nCooperative structure: ${matchContext.coopStructure}\nFit score: ${matchContext.fitScore}\nRationale: ${matchContext.rationale}`
        : "";

      const systemPrompt = `You are a Massachusetts cannabis cooperative licensing advisor. The applicant is working through a recommended next step from their license-match results.

Recommended next step they clicked: "${step}"
${contextBlurb}

Help them take this specific action. Provide concrete, practical guidance grounded in Massachusetts CCC regulations (935 CMR 500.000) and cooperative law (M.G.L. c. 157). Keep replies concise and actionable. When relevant, point to specific forms, agencies, or deadlines.`;

      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        const reply = response.content.find((b) => b.type === "text")?.text ?? "";
        return json({ success: true, reply });
      } catch (err) {
        console.error(err);
        return json({ error: "Internal server error." }, 500);
      }
    }

    /* ── POST /api/parcel → agentic parcel identification ── */
    if (request.method === "POST" && path === "/api/parcel") {
      if (!await checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured." }, 500);

      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

      const { licenseType, coopStructure, answers } = body ?? {};
      if (!licenseType || !coopStructure || !answers || typeof answers !== "object") {
        return json({ error: "Missing required fields: licenseType, coopStructure, answers." }, 400);
      }

      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 8000,
          system: buildParcelSystemPrompt(),
          messages: [{ role: "user", content: buildParcelPrompt(licenseType, coopStructure, answers) }],
        });

        const report = response.content.find((b) => b.type === "text")?.text;
        if (!report) return json({ error: "Claude returned an empty response." }, 502);

        return json({ success: true, report });
      } catch (err) {
        console.error(err);
        return json({ error: "Internal server error." }, 500);
      }
    }

    /* ── GET /api/session → restore wizard session state ── */
    if (request.method === "GET" && path === "/api/session") {
      if (!await checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
      if (!env.APPLICATION_DRAFTS) return json({ state: null });
      const sessionKey = `session:${resolveSessionKey(request, env)}`;
      const raw = await env.APPLICATION_DRAFTS.get(sessionKey);
      if (!raw) return json({ state: null });
      try {
        return json({ state: JSON.parse(raw) });
      } catch {
        return json({ state: null });
      }
    }

    /* ── POST /api/session → persist wizard session state ── */
    if (request.method === "POST" && path === "/api/session") {
      if (!await checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
      if (!env.APPLICATION_DRAFTS) return json({ ok: true });
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
      const { state } = body ?? {};
      if (state === undefined) return json({ error: "Missing required field: state." }, 400);
      const sessionKey = `session:${resolveSessionKey(request, env)}`;
      await env.APPLICATION_DRAFTS.put(sessionKey, JSON.stringify(state), { expirationTtl: SESSION_TTL });
      return json({ ok: true });
    }

    /* ── POST / → legacy draft endpoint (backward compat) ── */
    if (request.method === "POST" && path === "/") {
      if (!await checkBearer(request, env)) {
        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not configured." }, 500);
        return json({ error: "Unauthorized." }, 401);
      }
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
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 16000,
          system: buildSystemInstruction(),
          messages: [{ role: "user", content: buildPrompt(sectionName, task) }],
        });

        const generatedDraft = response.content.find((b) => b.type === "text")?.text;

        if (!generatedDraft) return json({ error: "Claude returned an empty response." }, 502);

        if (env.APPLICATION_DRAFTS) {
          const kvKey = sectionName.trim().toLowerCase().replace(/\s+/g, "-");
          await env.APPLICATION_DRAFTS.put(
            kvKey,
            JSON.stringify({ sectionName, draft: generatedDraft, savedAt: new Date().toISOString() })
          );
        }

        return json({ success: true, section: sectionName, draft: generatedDraft });
      } catch (err) {
        console.error(err);
        return json({ error: "Internal server error." }, 500);
      }
    }

    return text("Not found.", 404);
  },
};
