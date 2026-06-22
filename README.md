# cc-agent-worker

An asynchronous, edge-orchestrated cannabis compliance platform for Massachusetts Economic Empowerment and Craft Cooperative applicants. This repository delivers two integrated systems:

1. **Cloudflare Worker** — the public edge layer: AI application drafting, cooperative matching, and a REST API that serves pre-screened compliant parcels from a Cloudflare D1 database.
2. **Python Data Engine** — the offline compute layer: fetches raw assessor and school data, runs a vectorized geospatial compliance screen under EPSG:26986, and syncs results into D1 via a HMAC-verified webhook.

---

## Architecture

```
                            [ CLIENT / USER ]
                                    │
                                    ▼ (HTTP)
                      ┌─────────────────────────────┐
                      │   Cloudflare Worker Edge    │
                      │     (cc-agent-worker)       │
                      │                             │
                      │  GET  /                     │  ← Public landing page
                      │  GET  /admin                │  ← Admin dashboard
                      │  POST /api/auth             │  ← Issue signed session cookie
                      │  POST /api/match            │  ← 7-answer cooperative matcher
                      │  POST /api/draft            │  ← AI section drafter (Opus)
                      │  POST /api/chat             │  ← Next-step advisor (Haiku)
                      │  POST /api/parcel           │  ← Zoning & buffer report
                      │  GET  /api/session          │  ← Restore wizard state
                      │  POST /api/session          │  ← Persist wizard state
                      │                             │
                      │  GET  /api/parcels          │  ← D1: all screened parcels
                      │  GET  /api/parcels/compliant│  ← D1: compliant-only
                      │  GET  /api/parcels/:pid     │  ← D1: single parcel
                      │  GET  /api/pipeline/status  │  ← D1: last pipeline run stats
                      │  POST /api/pipeline/sync    │  ← HMAC-verified ingest
                      │  POST /api/pipeline/trigger │  ← Dispatch webhook (admin)
                      └──────────────┬──────────────┘
                                     │
                    ┌────────────────┼─────────────────┐
                    ▼                                   ▼
          [ Cloudflare KV ]                    [ Cloudflare D1 ]
          (drafts + sessions)             (parcels + pipeline runs)


                      [ Python Data Engine ]  ←  triggered by webhook or cron
                      (data-engine/)
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
          fetch_raw_data.py       spatial_screen.py
          (Boston + MassGIS)      (EPSG:26986 buffer)
                    │                    │
                    └─────────┬──────────┘
                              ▼
                        d1_sync.py
                    (POST /api/pipeline/sync
                     with HMAC signature)
```

---

## Repository Layout

```
cc-agent-worker/
├── src/                          # Cloudflare Worker (TypeScript/JS V8 runtime)
│   ├── index.js                  # All route handlers + exported helpers
│   ├── admin.js                  # Admin dashboard HTML
│   ├── landing.js                # Public landing page HTML
│   ├── ui.js                     # Section list + legacy UI
│   └── index.test.js             # 181-test Vitest suite (zero network calls)
│
├── data-engine/                  # Python geospatial processing engine
│   ├── src/
│   │   ├── fetch_raw_data.py     # Ingests Boston parcels + school seed data
│   │   └── spatial_screen.py    # Vectorized 550 ft buffer screen (EPSG:26986)
│   ├── d1_sync.py                # Pushes CSV results → Worker /api/pipeline/sync
│   ├── requirements.txt
│   └── tests/
│       ├── test_fetch_raw_data.py
│       ├── test_spatial_screen.py
│       └── test_d1_sync.py
│
├── data/                         # Local CSV cache (gitignored in production)
│   ├── boston_parcels_2025.csv
│   ├── chelsea_revere_parcels.csv
│   ├── sensitive_sites.csv
│   └── vetted_parcels.csv
│
├── schema.sql                    # D1 database migrations
├── analyze.py                    # One-command local pipeline runner
├── wrangler.toml                 # Cloudflare environments configuration
├── package.json
└── .github/workflows/deploy.yml  # CI: test-js + test-python → deploy
```

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

### 1 — Install JavaScript dependencies

```bash
npm install
```

### 2 — Set up the Python data engine

```bash
cd data-engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 3 — Authenticate with Cloudflare

```bash
npx wrangler login
```

### 4 — Create the KV namespace (drafts + sessions)

```bash
npx wrangler kv:namespace create APPLICATION_DRAFTS
```

Paste the returned `id` and `preview_id` into `wrangler.toml` under `[[kv_namespaces]]`.

### 5 — Create the D1 database (parcels)

```bash
npx wrangler d1 create suffolk-cannabis-db
```

Paste the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`.

Apply the schema:

```bash
# Remote (production)
npx wrangler d1 execute suffolk-cannabis-db --file=./schema.sql

# Local dev
npx wrangler d1 execute suffolk-cannabis-db --local --file=./schema.sql
```

### 6 — Store Worker secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY    # Anthropic API key
npx wrangler secret put ADMIN_TOKEN          # Admin dashboard password
npx wrangler secret put PIPELINE_SECRET      # HMAC key shared with d1_sync.py
# Optional: URL of an external serverless runner to trigger via /api/pipeline/trigger
# npx wrangler secret put PIPELINE_WEBHOOK_URL
```

### 7 — Run the full local pipeline

```bash
# Download raw data, run spatial screen, print summary
python analyze.py

# Common flags
python analyze.py --city Boston          # filter to one city
python analyze.py --use-code 401         # filter to light industrial
python analyze.py --top 10               # show top 10 compliant parcels
python analyze.py --compliant-only       # suppress disqualified table
python analyze.py --force                # re-download source data
```

### 8 — Sync results to Cloudflare D1

```bash
WORKER_URL=https://cc-agent-worker.YOUR_SUBDOMAIN.workers.dev \
PIPELINE_SECRET=your-shared-secret \
python data-engine/d1_sync.py

# Dry run (builds payload + signature, does not send)
python data-engine/d1_sync.py \
  --worker-url https://cc-agent-worker.YOUR_SUBDOMAIN.workers.dev \
  --secret your-shared-secret \
  --dry-run
```

### 9 — Run tests

```bash
# Worker tests (181 Vitest tests, zero network calls)
npm test

# Python data engine tests (48 pytest tests)
cd data-engine && python -m pytest tests/ -v
```

### 10 — Run locally

```bash
npm run dev
# Worker: http://localhost:8787
# Admin dashboard: http://localhost:8787/admin  (token: demo)
```

### 11 — Deploy

```bash
npm run deploy
```

---

## API Reference

### Parcel endpoints (D1-backed, public)

All three parcel endpoints are unauthenticated — they serve pre-screened public assessor data.

#### `GET /api/parcels`

List all screened industrial parcels with pagination.

Query parameters:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `city` | string | — | Filter by city (case-insensitive): `Boston`, `Chelsea`, `Revere` |
| `use_code` | integer | — | Filter by MA assessor use code: `400`, `401`, or `440` |
| `limit` | integer | `100` | Results per page (max 500) |
| `offset` | integer | `0` | Pagination offset |

```json
{
  "success": true,
  "parcels": [{ "pid": "BOS-0001", "city": "Boston", "is_compliant": 1, "distance_to_closest_ft": 620.5, ... }],
  "total": 60,
  "limit": 100,
  "offset": 0
}
```

#### `GET /api/parcels/compliant`

Same as `/api/parcels` but automatically filters to `is_compliant = 1`. Accepts the same query parameters.

#### `GET /api/parcels/:pid`

Single parcel lookup by PID.

```json
{ "success": true, "parcel": { "pid": "BOS-0001", ... } }
```

Returns `404` if the parcel is not in the database.

---

### Pipeline endpoints

#### `GET /api/pipeline/status`

Returns the last pipeline run metadata and current D1 row counts. Public.

```json
{
  "success": true,
  "last_run": {
    "id": 3,
    "run_at": "2026-06-22T00:00:00Z",
    "status": "complete",
    "total_screened": 120,
    "compliant_count": 38,
    "disqualified_count": 82,
    "duration_seconds": 14.7
  },
  "db_stats": {
    "total_parcels": 120,
    "compliant_parcels": 38
  }
}
```

#### `POST /api/pipeline/sync`

Receives screened parcel results from the Python data engine. **HMAC-verified** — requires `X-Pipeline-Signature: sha256=<hex>` header signed with `PIPELINE_SECRET`.

Not intended to be called directly. Use `data-engine/d1_sync.py` instead.

```json
{ "ok": true, "run_id": 3, "inserted": 120 }
```

#### `POST /api/pipeline/trigger`

Dispatches a webhook POST to `PIPELINE_WEBHOOK_URL` to kick off an external Python runner. Requires admin auth.

```json
{ "ok": true, "triggered_at": "2026-06-22T00:00:00.000Z" }
```

---

### AI / Application endpoints

All AI endpoints require `Authorization: Bearer <ADMIN_TOKEN>` (or `Bearer demo`) or a valid `admin_session` cookie.

#### `POST /api/match`

Accepts a 7-question applicant profile, returns 3 ranked license + cooperative structure matches.

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

#### `POST /api/draft`

Generates a submission-ready draft for a CCC application section.

```json
{ "sectionName": "Security Plan", "task": "24/7 CCTV, badge-access entry, visitor log policy." }
```

#### `POST /api/chat`

Multi-turn advisor chat grounded in a recommended next step.

#### `POST /api/parcel`

Generates a zoning + buffer report for a given license type and location.

#### `GET /api/session` / `POST /api/session`

Persist and restore wizard state across browser sessions (1-hour TTL in KV).

---

## Data Engine

### Statutory compliance rule

Massachusetts 935 CMR 500.110(3) requires a **500 ft minimum** between any cannabis establishment and a K-12 school boundary. The pipeline applies a **550 ft operational safety margin** to account for GIS coordinate drift and parcel-boundary approximations.

### Projection

All distance calculations are performed in **EPSG:26986** (NAD83 / Massachusetts Mainland, metres) using `geopandas.sjoin_nearest` with an STRtree spatial index — O(n log n) performance regardless of parcel count.

### Target use codes

| Code | Description |
|------|-------------|
| 400  | Manufacturing |
| 401  | Light Industrial |
| 440  | Multi-tenant Flex |

### Data sources

| Source | What | How |
|--------|------|-----|
| [Analyze Boston](https://data.boston.gov/) | Boston parcel assessor data | Direct CSV download |
| MassGIS WFS | Chelsea + Revere parcel data | REST endpoint (falls back to seeded mock) |
| MassGIS WFS | K-12 school locations | REST endpoint (falls back to curated seed list) |

---

## Environment Variables

| Variable | How to Set | Required | Purpose |
|----------|-----------|----------|---------|
| `ANTHROPIC_API_KEY` | `wrangler secret put` | Yes | Claude API access |
| `ADMIN_TOKEN` | `wrangler secret put` | Recommended | Admin dashboard auth (falls back to `demo`) |
| `PIPELINE_SECRET` | `wrangler secret put` | For D1 sync | HMAC key shared with `d1_sync.py` |
| `PIPELINE_WEBHOOK_URL` | `wrangler secret put` | For trigger | External Python runner endpoint |
| `APPLICATION_DRAFTS` | KV binding in `wrangler.toml` | No | Draft + session persistence |
| `PARCEL_DB` | D1 binding in `wrangler.toml` | For parcel API | Cloudflare D1 database |

---

## D1 Schema

Three tables (see `schema.sql`):

- **`pipeline_runs`** — one row per Python engine execution; tracks counts, duration, and status.
- **`sensitive_sites`** — K-12 schools used in the compliance screen.
- **`parcels`** — one row per industrial parcel with compliance verdict, nearest school name, and distance in feet. Upserted on every pipeline run. Indexed on `is_compliant`, `city`, `use_code`, and `distance_to_closest_ft`.

---

## Deployment via GitHub Actions

The workflow (`.github/workflows/deploy.yml`) gates every deploy on both test suites:

```
test-js (181 Vitest) ─┐
                       ├─► deploy (wrangler deploy + D1 schema migration)
test-python (48 pytest)┘
```

Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`.

---

## Error Responses

All endpoints return `{ "error": "<message>" }` on failure. Stack traces are never exposed.

| Status | When |
|--------|------|
| 400 | Missing or invalid fields, non-JSON body |
| 401 | Missing/invalid auth token, cookie, or pipeline signature |
| 404 | Unknown route or parcel PID not found |
| 500 | Unexpected exception |
| 502 | Claude returned empty response, or pipeline webhook returned error |
| 503 | Required binding (`PARCEL_DB`, `PIPELINE_SECRET`, `PIPELINE_WEBHOOK_URL`) not configured |
