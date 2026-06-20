# cc-agent-worker

A Cloudflare Worker that powers **CCCAssist** — an AI-assisted Massachusetts Cannabis Control Commission (CCC) license application tool for cooperatives, built on Anthropic Claude.

Features:

- **7-question cooperative matcher** — ranks CCC license types and cooperative structures by fit score
- **AI application drafting** — generates submission-ready section drafts aligned with 935 CMR 500.000
- **Step-by-step chatbot** — click any recommended next step to open a guided chat advisor
- **Parcel identification report** — zoning districts, buffer tables, canopy estimates, and MassMapper instructions
- **Session persistence** — wizard state auto-saved to Cloudflare KV so applicants can return across sessions
- **HMAC-signed session cookies** — cookie-based auth backed by a server-side HMAC signature; no plaintext tokens stored in the browser

---

## Architecture

```
Browser
  │
  ├── GET  /          → Public landing page (HTML)
  ├── GET  /admin     → Admin dashboard (HTML, cookie-gated)
  │
  ├── POST /api/auth      → Verify ADMIN_TOKEN → issue signed session cookie
  ├── POST /api/logout    → Expire session cookie → redirect /admin
  │
  ├── POST /api/match     → 7-answer profile → 3 ranked license/coop matches  (Haiku)
  ├── POST /api/draft     → Section name + notes → submission-ready draft      (Opus)
  ├── POST /api/chat      → Next-step context + messages → advisor reply        (Haiku)
  ├── POST /api/parcel    → License/coop/profile → parcel & zoning report       (Opus)
  │
  ├── GET  /api/session   → Restore wizard state from KV
  ├── POST /api/session   → Persist wizard state to KV (TTL 1 h)
  │
  └── POST /          → Legacy draft endpoint (backward compat, auth-gated)
```

All endpoints return `{ "error": "<message>" }` on failure. Stack traces are never exposed to callers.

---

## Project layout

```
cc-agent-worker/
├── src/
│   ├── index.js          # Worker handler + exported helpers
│   ├── admin.js          # Admin dashboard HTML (login gate + tabbed UI)
│   ├── landing.js        # Public landing page HTML
│   ├── ui.js             # SECTIONS list + legacy standalone UI
│   └── index.test.js     # 127-test Vitest suite (zero network calls)
├── .github/
│   └── workflows/
│       └── deploy.yml    # Wrangler deploy on push to main
├── package.json
├── vitest.config.js
└── wrangler.toml
```

---

## Prerequisites

- Node.js 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

### 1 — Install dependencies

```bash
npm install
```

### 2 — Authenticate with Cloudflare

```bash
npx wrangler login
```

### 3 — Create the KV namespace

```bash
npx wrangler kv:namespace create APPLICATION_DRAFTS
```

Wrangler prints:

```
[[kv_namespaces]]
binding = "APPLICATION_DRAFTS"
id = "abc123..."
```

Open `wrangler.toml` and replace the `id` (and `preview_id`) placeholders with the printed values.

### 4 — Store secrets

```bash
# Required — Anthropic API key
npx wrangler secret put ANTHROPIC_API_KEY

# Recommended — admin dashboard password
npx wrangler secret put ADMIN_TOKEN
```

`ADMIN_TOKEN` can be any string. If omitted, the built-in `demo` token is the only way to log in.

### 5 — Run tests

```bash
npm test
```

All 127 tests pass in under one second with no network calls.

### 6 — Run locally

```bash
npm run dev
```

Worker available at `http://localhost:8787`. The admin dashboard is at `http://localhost:8787/admin`; use token `demo` to log in.

### 7 — Deploy to production

```bash
npm run deploy
```

---

## API reference

All protected endpoints require either:
- `Authorization: Bearer <ADMIN_TOKEN>` header, **or**
- `Authorization: Bearer demo` header (always accepted), **or**
- A valid `admin_session` cookie (issued by `POST /api/auth`)

### `POST /api/auth`

Verifies a raw admin token and issues an HMAC-signed session cookie (1 hour TTL).

```http
POST /api/auth
Authorization: Bearer <your-admin-token>
```

```json
{ "ok": true }
```

The response also sets:
```
Set-Cookie: admin_session=<signed-token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
```

### `POST /api/match`

Accepts a 7-question applicant profile and returns three ranked license + cooperative structure matches.

```json
{
  "answers": {
    "interests": ["cultivation"],
    "skills": ["agriculture", "business"],
    "capital": "250k_1m",
    "coop_model": "worker",
    "equity": ["sep"],
    "location": "worcester",
    "risk": "moderate"
  }
}
```

Response:
```json
{
  "success": true,
  "matches": [
    {
      "rank": 1,
      "licenseType": "Adult-Use Cultivator",
      "coopStructure": "Worker Cooperative",
      "fitScore": 92,
      "rationale": "...",
      "equityNotes": "...",
      "nextSteps": ["Step one", "Step two", "Step three"]
    }
  ]
}
```

### `POST /api/draft`

Generates a submission-ready draft for a CCC application section.

```json
{
  "sectionName": "Security Plan",
  "task": "24/7 CCTV coverage of all canopy areas, badge-access entry, visitor log policy."
}
```

Or, called from the matcher flow (generates an Executive Summary):

```json
{
  "sectionName": "Executive Summary",
  "licenseType": "Adult-Use Cultivator",
  "coopStructure": "Worker Cooperative",
  "answers": { ... }
}
```

Response:
```json
{
  "success": true,
  "section": "Security Plan",
  "draft": "## Security Plan\n\n### 1. Overview\n\nPursuant to 935 CMR 500.110..."
}
```

Drafts are automatically saved to KV under a slug of the section name (e.g. `security-plan`).

### `POST /api/chat`

Multi-turn advisor chat grounded in the recommended next step from a matcher result.

```json
{
  "step": "File Articles of Organization with the Massachusetts Secretary of State",
  "matchContext": {
    "licenseType": "Adult-Use Cultivator",
    "coopStructure": "Worker Cooperative",
    "fitScore": 92,
    "rationale": "..."
  },
  "messages": [
    { "role": "user", "content": "What form do I use?" }
  ]
}
```

Response:
```json
{ "success": true, "reply": "..." }
```

`step` is limited to 300 characters. `matchContext` is optional.

### `POST /api/parcel`

Generates a parcel identification report covering zoning districts, lot-size requirements, buffer tables, and MassMapper search instructions.

```json
{
  "licenseType": "Adult-Use Cultivator",
  "coopStructure": "Worker Cooperative",
  "answers": { "location": "worcester", "capital": "250k_1m" }
}
```

Response:
```json
{ "success": true, "report": "## 1. Permitted Zoning Districts\n\n..." }
```

Cultivation license types additionally receive a canopy sizing estimate (Tier 1–11 per 935 CMR 500.002).

### `GET /api/session` / `POST /api/session`

Persist and restore wizard state across browser sessions.

```json
// POST body
{ "state": { "answers": { ... }, "step": 3, "_matches": [...] } }
```

State is stored in KV with a 1-hour TTL keyed to the session token. Returns `{ "state": null }` when no saved state exists.

---

## Error responses

| Status | When |
|--------|------|
| 400 | Missing or invalid fields, or non-JSON body |
| 401 | Missing or invalid auth token / session cookie |
| 404 | Unrecognised route or method |
| 500 | `ANTHROPIC_API_KEY` or `ADMIN_TOKEN` not configured, or unexpected exception |
| 502 | Claude returned an empty response |

---

## Environment variables

| Name | How to set | Required |
|------|------------|----------|
| `ANTHROPIC_API_KEY` | `npx wrangler secret put ANTHROPIC_API_KEY` | Yes |
| `ADMIN_TOKEN` | `npx wrangler secret put ADMIN_TOKEN` | Recommended (falls back to demo-only) |
| `APPLICATION_DRAFTS` | KV binding in `wrangler.toml` | No (session + draft persistence disabled) |

---

## Retrieving saved drafts from KV

KV keys are slug-ified section names (lowercase, spaces → `-`).

```bash
# List all stored draft keys
npx wrangler kv:key list --binding APPLICATION_DRAFTS

# Read a specific draft
npx wrangler kv:key get --binding APPLICATION_DRAFTS "security-plan"
```

Each value is a JSON envelope:
```json
{
  "sectionName": "Security Plan",
  "draft": "...",
  "savedAt": "2026-06-20T01:00:00.000Z"
}
```

Session state keys are prefixed `session:` and expire automatically after 1 hour.

---

## Development

```bash
npm test             # run all 127 tests once
npm run test:watch   # watch mode
npm run test:coverage  # V8 coverage → coverage/lcov.info
```

### Conventions

- `buildSystemInstruction()`, `buildPrompt()`, and `createSessionToken()` are exported pure functions for direct unit testing.
- All error responses follow `{ "error": "<message>" }` — no stack traces leak to callers.
- KV draft values are JSON envelopes (not raw text) so metadata survives round-trips.
- Session tokens are HMAC-SHA-256 signed with the `ADMIN_TOKEN` secret; the raw token is never stored in a cookie.

---

## Deployment via GitHub Actions

The workflow in `.github/workflows/deploy.yml` deploys on every push to `main`:

```yaml
- name: Deploy Worker
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. The `ANTHROPIC_API_KEY` and `ADMIN_TOKEN` worker secrets must be stored via `wrangler secret put` (the workflow re-pushes `ANTHROPIC_API_KEY` on every deploy from the same-named repo secret).
