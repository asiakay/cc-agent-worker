import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { buildSystemInstruction, buildPrompt } from "./index.js";

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK — no real network calls
// ---------------------------------------------------------------------------
const mockStream = vi.fn();
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      stream: mockStream,   // used by /api/draft and POST /
      create: mockCreate,   // used by /api/match
    },
  }));
  return { default: MockAnthropic };
});

const MOCK_DRAFT = "## Environmental Plan\n\nThis facility shall install...";

const MOCK_MATCHES = [
  {
    rank: 1,
    licenseType: "Adult-Use Cultivator",
    coopStructure: "Worker Cooperative",
    fitScore: 92,
    rationale: "Strong fit for small team with cultivation expertise.",
    equityNotes: "Eligible for social equity pathway under 935 CMR 500.050.",
    nextSteps: ["File Articles of Organization", "Obtain EIN", "Open cooperative bank account"],
  },
  {
    rank: 2,
    licenseType: "Craft Marijuana Cooperative",
    coopStructure: "Producer Cooperative",
    fitScore: 78,
    rationale: "Smaller scale suits craft designation.",
    equityNotes: "Limited equity incentives for producer cooperatives.",
    nextSteps: ["Consult cooperative attorney", "Review CMR craft limits", "Identify members"],
  },
  {
    rank: 3,
    licenseType: "Adult-Use Retailer",
    coopStructure: "Consumer Cooperative",
    fitScore: 61,
    rationale: "Viable if retail location secured.",
    equityNotes: "Consumer co-ops qualify for priority review.",
    nextSteps: ["Identify retail location", "Research local zoning", "Engage host community"],
  },
];

function makeFinalMessage(text = MOCK_DRAFT) {
  return { content: [{ type: "text", text }], stop_reason: "end_turn" };
}

function makeStreamHandle(finalMsg) {
  return { finalMessage: vi.fn().mockResolvedValue(finalMsg) };
}

// ---------------------------------------------------------------------------
// Minimal KV namespace mock
// ---------------------------------------------------------------------------
function makeKV() {
  const store = new Map();
  return {
    put: vi.fn(async (key, value) => store.set(key, value)),
    get: vi.fn(async (key) => store.get(key) ?? null),
    _store: store,
  };
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------
function makeEnv(overrides = {}) {
  return {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    ADMIN_TOKEN: "secret-admin",
    APPLICATION_DRAFTS: makeKV(),
    ...overrides,
  };
}

function post(body, path = "/", headers = {}) {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function authedPost(body, path, token = "secret-admin") {
  return post(body, path, { Authorization: `Bearer ${token}` });
}

function demoPost(body, path) {
  return authedPost(body, path, "demo");
}

function get(path = "/") {
  return new Request(`https://worker.example${path}`, { method: "GET" });
}

function options() {
  return new Request("https://worker.example/", {
    method: "OPTIONS",
    headers: { "Access-Control-Request-Method": "POST" },
  });
}

beforeEach(() => {
  mockStream.mockReturnValue(makeStreamHandle(makeFinalMessage()));
  mockCreate.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(MOCK_MATCHES) }] });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Unit: prompt builders
// ---------------------------------------------------------------------------
describe("buildSystemInstruction", () => {
  it("mentions Massachusetts and CCC", () => {
    const si = buildSystemInstruction();
    expect(si).toContain("Massachusetts");
    expect(si).toContain("Cannabis Control Commission");
  });

  it("references 935 CMR", () => {
    expect(buildSystemInstruction()).toContain("935 CMR");
  });

  it("is non-empty", () => {
    expect(buildSystemInstruction().length).toBeGreaterThan(50);
  });
});

describe("buildPrompt", () => {
  it("embeds sectionName and task", () => {
    const p = buildPrompt("Section 3.2", "LED transition plan");
    expect(p).toContain("Section 3.2");
    expect(p).toContain("LED transition plan");
  });

  it("requests submission-ready output", () => {
    expect(buildPrompt("X", "Y")).toContain("submission-ready");
  });

  it("asks for OPERATOR TO CONFIRM placeholders", () => {
    expect(buildPrompt("X", "Y")).toContain("[OPERATOR TO CONFIRM]");
  });
});

// ---------------------------------------------------------------------------
// CORS / routing
// ---------------------------------------------------------------------------
describe("OPTIONS preflight", () => {
  it("returns 200 with CORS headers", async () => {
    const res = await worker.fetch(options(), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("GET /", () => {
  it("returns 200 HTML landing page", async () => {
    const res = await worker.fetch(get("/"), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html");
  });
});

describe("GET /admin", () => {
  it("returns 200 HTML login gate when not authed", async () => {
    const res = await worker.fetch(get("/admin"), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("Admin");
  });
});

describe("unknown route", () => {
  it("returns 404 for unrecognised path", async () => {
    const req = new Request("https://worker.example/does-not-exist", { method: "GET" });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(404);
  });

  it("returns 404 for unrecognised method on /", async () => {
    const req = new Request("https://worker.example/", { method: "PUT" });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Auth: checkBearer via /api/auth
// ---------------------------------------------------------------------------
describe("POST /api/auth", () => {
  it("accepts the admin token and sets session cookie", async () => {
    const res = await worker.fetch(
      post({}, "/api/auth", { Authorization: "Bearer secret-admin" }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(res.headers.get("Set-Cookie")).toContain("admin_session=");
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  it("accepts the hardcoded demo token without ADMIN_TOKEN set", async () => {
    const res = await worker.fetch(
      post({}, "/api/auth", { Authorization: "Bearer demo" }),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(res.headers.get("Set-Cookie")).toContain("admin_session=");
  });

  it("accepts the hardcoded demo token even when ADMIN_TOKEN is also set", async () => {
    const res = await worker.fetch(
      post({}, "/api/auth", { Authorization: "Bearer demo" }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("rejects a wrong token with 401", async () => {
    const res = await worker.fetch(
      post({}, "/api/auth", { Authorization: "Bearer wrong-token" }),
      makeEnv()
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid token/i);
  });

  it("rejects a missing Authorization header with 401", async () => {
    const res = await worker.fetch(post({}, "/api/auth"), makeEnv());
    expect(res.status).toBe(401);
  });

  it("rejects a malformed Bearer header with 401", async () => {
    const res = await worker.fetch(
      post({}, "/api/auth", { Authorization: "Token secret-admin" }),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a wrong token even when ADMIN_TOKEN is not set", async () => {
    const res = await worker.fetch(
      post({}, "/api/auth", { Authorization: "Bearer wrong" }),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid token/i);
  });
});

// ---------------------------------------------------------------------------
// GET /admin — cookie-gated dashboard
// ---------------------------------------------------------------------------
describe("GET /admin", () => {
  it("renders login gate when no session cookie", async () => {
    const res = await worker.fetch(get("/admin"), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("login-form");
    expect(body).not.toContain('id="tab-matcher"');
  });

  it("renders dashboard when valid admin session cookie present", async () => {
    const req = new Request("https://worker.example/admin", {
      method: "GET",
      headers: { Cookie: "admin_session=secret-admin" },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('id="tab-matcher"');
    expect(body).not.toContain("login-form");
  });

  it("renders dashboard when demo session cookie present (no ADMIN_TOKEN)", async () => {
    const req = new Request("https://worker.example/admin", {
      method: "GET",
      headers: { Cookie: "admin_session=demo" },
    });
    const res = await worker.fetch(req, makeEnv({ ADMIN_TOKEN: undefined }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('id="tab-matcher"');
  });

  it("renders login gate when session cookie has wrong token", async () => {
    const req = new Request("https://worker.example/admin", {
      method: "GET",
      headers: { Cookie: "admin_session=wrong-token" },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("login-form");
  });

  it("renders error banner when ?error=1 is present", async () => {
    const res = await worker.fetch(get("/admin?error=1"), makeEnv());
    const body = await res.text();
    expect(body).toContain("Incorrect token");
  });
});

// ---------------------------------------------------------------------------
// Auth: /api/match — demo token unlocks endpoint
// ---------------------------------------------------------------------------
describe("POST /api/match — auth", () => {
  it("allows demo token when ADMIN_TOKEN is not set", async () => {
    const res = await worker.fetch(
      demoPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(200);
  });

  it("allows demo token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      demoPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("allows the real admin token", async () => {
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 for wrong token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match", "wrong"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 when no token and ADMIN_TOKEN not configured", async () => {
    const res = await worker.fetch(
      post({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ADMIN_TOKEN not configured/i);
  });
});

// ---------------------------------------------------------------------------
// Auth: /api/draft — demo token unlocks endpoint
// ---------------------------------------------------------------------------
describe("POST /api/draft — auth", () => {
  it("allows demo token when ADMIN_TOKEN is not set", async () => {
    const res = await worker.fetch(
      demoPost({ sectionName: "Security Plan", task: "24/7 cameras" }, "/api/draft"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(200);
  });

  it("allows demo token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      demoPost({ sectionName: "Security Plan", task: "24/7 cameras" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 for wrong token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Security Plan", task: "cameras" }, "/api/draft", "bad-token"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 when no token and ADMIN_TOKEN not configured", async () => {
    const res = await worker.fetch(
      post({ sectionName: "Security Plan", task: "cameras" }, "/api/draft"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ADMIN_TOKEN not configured/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/match — happy path
// ---------------------------------------------------------------------------
describe("POST /api/match — happy path", () => {
  it("returns 200 with ranked matches", async () => {
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years", capital: "200k" } }, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches).toHaveLength(3);
  });

  it("uses claude-haiku-4-5-20251001 for fast turnaround", async () => {
    await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("returns matches with required fields", async () => {
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    const { matches } = await res.json();
    for (const m of matches) {
      expect(m).toHaveProperty("rank");
      expect(m).toHaveProperty("licenseType");
      expect(m).toHaveProperty("coopStructure");
      expect(m).toHaveProperty("fitScore");
      expect(m).toHaveProperty("rationale");
      expect(m).toHaveProperty("nextSteps");
    }
  });

  it("returns 400 when answers is missing", async () => {
    const res = await worker.fetch(
      authedPost({}, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/answers/i);
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new Request("https://worker.example/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" },
      body: "not json",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv({ ANTHROPIC_API_KEY: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });

  it("handles model returning JSON wrapped in markdown fences", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(MOCK_MATCHES) + "\n```" }],
    });
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(3);
  });

  it("returns 502 when model returns unparseable response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot help with that." }],
    });
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(502);
  });

  it("returns 500 when API throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Rate limited"));
    const res = await worker.fetch(
      authedPost({ answers: { experience: "5 years" } }, "/api/match"),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Rate limited");
  });
});

// ---------------------------------------------------------------------------
// POST /api/draft — happy path
// ---------------------------------------------------------------------------
describe("POST /api/draft — happy path", () => {
  it("returns 200 with draft content", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Environmental Plan", task: "LED transition" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.draft).toBe(MOCK_DRAFT);
    expect(body.section).toBe("Environmental Plan");
  });

  it("saves draft to KV with slugified key", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      authedPost({ sectionName: "Security Plan", task: "24/7 cameras" }, "/api/draft"),
      env
    );
    const body = await res.json();
    expect(body.savedToKV).toBe(true);
    const [kvKey, kvValue] = env.APPLICATION_DRAFTS.put.mock.calls[0];
    expect(kvKey).toBe("security-plan");
    const stored = JSON.parse(kvValue);
    expect(stored.draft).toBe(MOCK_DRAFT);
    expect(stored.sectionName).toBe("Security Plan");
    expect(stored.savedAt).toBeDefined();
  });

  it("reports savedToKV: false when KV binding absent", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Inventory Plan", task: "seed-to-sale" }, "/api/draft"),
      makeEnv({ APPLICATION_DRAFTS: undefined })
    );
    const body = await res.json();
    expect(body.savedToKV).toBe(false);
  });

  it("passes claude-opus-4-8 to the SDK", async () => {
    const env = makeEnv();
    await worker.fetch(
      authedPost({ sectionName: "Staffing Plan", task: "background checks" }, "/api/draft"),
      env
    );
    expect(mockStream.mock.calls[0][0].model).toBe("claude-opus-4-8");
  });

  it("embeds sectionName and task in the generation prompt", async () => {
    const env = makeEnv();
    await worker.fetch(
      authedPost({ sectionName: "Waste Management", task: "compostable organics" }, "/api/draft"),
      env
    );
    const prompt = mockStream.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Waste Management");
    expect(prompt).toContain("compostable organics");
  });

  it("uses exec summary prompt when licenseType + coopStructure + answers present", async () => {
    const env = makeEnv();
    await worker.fetch(
      authedPost(
        {
          sectionName: "Executive Summary",
          licenseType: "Adult-Use Cultivator",
          coopStructure: "Worker Cooperative",
          answers: { experience: "5 years" },
        },
        "/api/draft"
      ),
      env
    );
    const prompt = mockStream.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Adult-Use Cultivator");
    expect(prompt).toContain("Worker Cooperative");
  });

  it("sets CORS headers on 200 response", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Section A", task: "task A" }, "/api/draft"),
      makeEnv()
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("includes max_tokens and thinking config", async () => {
    await worker.fetch(
      authedPost({ sectionName: "Transport Plan", task: "GPS tracking" }, "/api/draft"),
      makeEnv()
    );
    const cfg = mockStream.mock.calls[0][0];
    expect(cfg.max_tokens).toBeGreaterThan(0);
    expect(cfg.thinking).toEqual({ type: "adaptive" });
  });

  it("returns 400 when sectionName is missing", async () => {
    const res = await worker.fetch(
      authedPost({ task: "some task" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sectionName/i);
  });

  it("returns 400 when task is missing and no exec summary fields", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Section X" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when sectionName is blank whitespace", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "   ", task: "something" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Section 1", task: "plan" }, "/api/draft"),
      makeEnv({ ANTHROPIC_API_KEY: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });

  it("returns 502 when Claude returns empty text", async () => {
    mockStream.mockReturnValueOnce(
      makeStreamHandle({ content: [{ type: "text", text: "" }], stop_reason: "end_turn" })
    );
    const res = await worker.fetch(
      authedPost({ sectionName: "Section B", task: "task B" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 500 when SDK throws", async () => {
    mockStream.mockReturnValueOnce({
      finalMessage: vi.fn().mockRejectedValueOnce(new Error("Quota exceeded")),
    });
    const res = await worker.fetch(
      authedPost({ sectionName: "Section C", task: "task C" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Quota exceeded");
  });
});

// ---------------------------------------------------------------------------
// POST / — legacy endpoint (backward compat, no auth)
// ---------------------------------------------------------------------------
describe("POST / — legacy draft endpoint", () => {
  it("returns 200 with draft content", async () => {
    const res = await worker.fetch(
      post({ sectionName: "Environmental Plan - Section 3.2", task: "LED plan" }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.draft).toBe(MOCK_DRAFT);
    expect(body.section).toBe("Environmental Plan - Section 3.2");
  });

  it("saves draft to KV and reports savedToKV: true", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      post({ sectionName: "Security Plan", task: "24/7 camera coverage" }),
      env
    );
    const body = await res.json();
    expect(body.savedToKV).toBe(true);
    expect(env.APPLICATION_DRAFTS.put).toHaveBeenCalledOnce();
    const [kvKey, kvValue] = env.APPLICATION_DRAFTS.put.mock.calls[0];
    expect(kvKey).toBe("security-plan");
    const stored = JSON.parse(kvValue);
    expect(stored.draft).toBe(MOCK_DRAFT);
    expect(stored.sectionName).toBe("Security Plan");
    expect(stored.savedAt).toBeDefined();
  });

  it("reports savedToKV: false when KV binding is absent", async () => {
    const res = await worker.fetch(
      post({ sectionName: "Inventory Plan", task: "seed-to-sale tracking" }),
      makeEnv({ APPLICATION_DRAFTS: undefined })
    );
    const body = await res.json();
    expect(body.savedToKV).toBe(false);
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new Request("https://worker.example/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid JSON/i);
  });

  it("returns 400 when sectionName is missing", async () => {
    const res = await worker.fetch(post({ task: "some task" }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sectionName/i);
  });

  it("returns 400 when task is missing", async () => {
    const res = await worker.fetch(post({ sectionName: "Environmental Plan" }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/task/i);
  });

  it("returns 400 when sectionName is blank whitespace", async () => {
    const res = await worker.fetch(post({ sectionName: "   ", task: "something" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 when task is blank whitespace", async () => {
    const res = await worker.fetch(post({ sectionName: "Section 1", task: "   " }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const res = await worker.fetch(
      post({ sectionName: "Section 1", task: "plan" }),
      makeEnv({ ANTHROPIC_API_KEY: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });

  it("passes the correct model to the SDK", async () => {
    await worker.fetch(
      post({ sectionName: "Staffing Plan", task: "background checks" }),
      makeEnv()
    );
    expect(mockStream.mock.calls[0][0].model).toBe("claude-opus-4-8");
  });

  it("embeds sectionName and task in the generation prompt", async () => {
    await worker.fetch(
      post({ sectionName: "Waste Management", task: "compostable organic waste" }),
      makeEnv()
    );
    const prompt = mockStream.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Waste Management");
    expect(prompt).toContain("compostable organic waste");
  });

  it("includes max_tokens and thinking in config", async () => {
    await worker.fetch(
      post({ sectionName: "Transport Plan", task: "GPS tracking" }),
      makeEnv()
    );
    const cfg = mockStream.mock.calls[0][0];
    expect(cfg.max_tokens).toBeGreaterThan(0);
    expect(cfg.thinking).toEqual({ type: "adaptive" });
  });

  it("sets CORS headers on 200 response", async () => {
    const res = await worker.fetch(post({ sectionName: "Section A", task: "task A" }), makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 502 when Claude returns empty text", async () => {
    mockStream.mockReturnValueOnce(
      makeStreamHandle({ content: [{ type: "text", text: "" }], stop_reason: "end_turn" })
    );
    const res = await worker.fetch(
      post({ sectionName: "Section B", task: "task B" }),
      makeEnv()
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 500 when SDK throws", async () => {
    mockStream.mockReturnValueOnce({
      finalMessage: vi.fn().mockRejectedValueOnce(new Error("Quota exceeded")),
    });
    const res = await worker.fetch(
      post({ sectionName: "Section C", task: "task C" }),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Quota exceeded");
  });

  it("returns 500 with generic message when SDK throws without message", async () => {
    mockStream.mockReturnValueOnce({
      finalMessage: vi.fn().mockRejectedValueOnce({}),
    });
    const res = await worker.fetch(
      post({ sectionName: "Section D", task: "task D" }),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
