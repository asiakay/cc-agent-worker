# cc-agent-worker

A Cloudflare Worker that drafts Massachusetts adult-use cannabis cultivator
license application sections using Anthropic Claude (Opus 4.8 with adaptive
thinking), with completed drafts auto-saved to Cloudflare KV storage.

---

## How it works

```
POST /  { sectionName, task }
          │
          ▼
   Input validation
          │
          ▼
  Anthropic Claude Opus 4.8
  (regulatory persona + CMR citations)
          │
          ▼
  Auto-save to Cloudflare KV
          │
          ▼
  { success, section, savedToKV, draft }
```

The worker exposes three routes:

| Method  | Behaviour |
|---------|-----------|
| `OPTIONS` | Returns CORS preflight headers |
| `GET`     | Health-check: returns `{ status: "ok" }` |
| `POST`    | Generates and saves a license section draft |

---

## Project layout

```
cc-agent-worker/
├── src/
│   ├── index.js          # Worker handler + exported helpers
│   └── index.test.js     # 25-test Vitest suite
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

Wrangler prints something like:

```
[[kv_namespaces]]
binding = "APPLICATION_DRAFTS"
id = "abc123..."
```

Open `wrangler.toml` and replace the `id` (and `preview_id`) placeholders
with the values from the output.

### 4 — Store your Anthropic API key as a secret

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

Paste your key when prompted. Wrangler encrypts it — it will never appear
in `wrangler.toml` or source control.

### 5 — Run tests

```bash
npm test
```

All 25 tests should pass in under one second.

### 6 — Run locally

```bash
npm run dev
```

The worker is now available at `http://localhost:8787`.

### 7 — Deploy to production

```bash
npm run deploy
```

Wrangler prints your public worker URL on success.

---

## Usage

Send a `POST` request with a JSON body containing:

| Field         | Type   | Description |
|---------------|--------|-------------|
| `sectionName` | string | The application section title (used as the KV storage key) |
| `task`        | string | Your notes, strategy, or bullet points for this section |

### Example — cURL

```bash
curl -X POST https://<your-worker>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "sectionName": "Environmental Plan - Section 3.2",
    "task": "Draft an energy mitigation plan for a Tier 1 indoor cultivation facility, focusing on high-efficiency LED transitions and closed-loop HVAC cooling."
  }'
```

### Example — fetch (JavaScript)

```js
const res = await fetch("https://<your-worker>.workers.dev", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sectionName: "Security Plan - Section 4.1",
    task: "24/7 CCTV coverage of all canopy areas, badge-access entry, visitor log policy.",
  }),
});
const { success, draft, savedToKV } = await res.json();
console.log(draft);
```

### Example response

```json
{
  "success": true,
  "section": "Environmental Plan - Section 3.2",
  "savedToKV": true,
  "draft": "## 3.2 Energy Mitigation Plan\n\n### 3.2.1 Overview\n\nPursuant to 935 CMR 500.105(f), the licensee shall implement the following..."
}
```

---

## Retrieving saved drafts from KV

KV keys are slug-ified section names (lowercase, spaces replaced with `-`).
Use the Wrangler CLI to read them back:

```bash
# List all stored draft keys
npx wrangler kv:key list --binding APPLICATION_DRAFTS

# Read a specific draft
npx wrangler kv:key get --binding APPLICATION_DRAFTS "environmental-plan---section-3.2"
```

Each value is a JSON record:

```json
{
  "sectionName": "Environmental Plan - Section 3.2",
  "draft": "...",
  "savedAt": "2026-06-16T23:07:00.000Z"
}
```

---

## Error responses

| Status | When |
|--------|------|
| 400 | Missing or blank `sectionName` or `task`, or invalid JSON |
| 405 | Any method other than GET, POST, OPTIONS |
| 500 | `ANTHROPIC_API_KEY` secret not configured, or unexpected exception |
| 502 | Claude returned an empty response |

All error bodies follow `{ "error": "<message>" }`.

---

## Environment variables

| Name | How to set | Required |
|------|------------|----------|
| `ANTHROPIC_API_KEY` | `npx wrangler secret put ANTHROPIC_API_KEY` | Yes |
| `APPLICATION_DRAFTS` | KV binding in `wrangler.toml` | No (drafts won't be persisted) |

---

## Development

### Running tests in watch mode

```bash
npm run test:watch
```

### Generating a coverage report

```bash
npm run test:coverage
```

Coverage is reported via V8 and written to `coverage/lcov.info`.

### Project conventions

- `buildSystemInstruction()` and `buildPrompt()` are exported pure functions
  so they can be unit-tested without spinning up a Worker.
- The KV key is the slug of `sectionName`; the stored value is a JSON
  envelope (not raw text) so metadata survives round-trips.
- All error responses use the same `{ error }` shape; stack traces are never
  leaked to callers.

---

## Deployment via GitHub Actions

A workflow in `.github/workflows/` can deploy on push to `main`:

```yaml
- name: Deploy to Cloudflare Workers
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Set `CLOUDFLARE_API_TOKEN` in your repository secrets. The `GEMINI_API_KEY`
secret must already be stored in the Worker via `wrangler secret put`.
