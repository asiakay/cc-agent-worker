# cc-agent-worker

A Cloudflare Worker that drafts cannabis cultivator license application
sections using the Anthropic API, with completed drafts auto-saved to
Cloudflare KV.

## What changed from the original draft

- Removed `@google/generative-ai` (not designed for the Workers runtime,
  and the package name in the original was wrong anyway).
- No SDK dependency needed — calls the Anthropic API directly via `fetch`.
- Fixed `systemInstruction` placement (was incorrectly nested inside
  `generationConfig`; now passed as a top-level `system` field per the
  Anthropic Messages API).
- Removed the hardcoded "moratorium / June 16 deadline" framing from the
  system prompt — that was manufacturing urgency not relevant to this use case.
- Cleaned up `wrangler.toml`: no API key placeholder, correct secret-based
  flow, current `compatibility_date`.

## Setup

1. Install Wrangler (dev dependency is already in package.json):
   ```bash
   cd cc-agent-worker
   npm install
   ```

2. Log in to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Create the KV namespace:
   ```bash
   npx wrangler kv:namespace create APPLICATION_DRAFTS
   ```
   Copy the returned `id` (and `preview_id` if using `wrangler dev`) into
   `wrangler.toml`, replacing the placeholders.

4. Set your Anthropic API key as a secret:
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

5. Run locally:
   ```bash
   npx wrangler dev
   ```

6. Deploy:
   ```bash
   npm run deploy
   ```

## Usage

POST to the worker URL:

```json
{
  "sectionName": "Environmental Plan - Section 3.2",
  "task": "Draft an energy mitigation plan for a Tier 1 indoor cultivation facility, focusing on high-efficiency LED transitions and closed-loop HVAC cooling."
}
```

Response includes the generated draft and whether it was saved to KV.
