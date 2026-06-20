import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { buildSystemInstruction, buildPrompt, createSessionToken } from "./index.js";

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
  mockCreate.mockResolvedValue({ content: [{ type: "text", text: MOCK_DRAFT }] });
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
    expect(res.headers.get("Set-Cookie")).toContain("Secure");
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
    const env = makeEnv();
    const sessionToken = await createSessionToken(env);
    const req = new Request("https://worker.example/admin", {
      method: "GET",
      headers: { Cookie: `admin_session=${encodeURIComponent(sessionToken)}` },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('id="tab-matcher"');
    expect(body).not.toContain("login-form");
  });

  it("renders dashboard when demo session cookie present (no ADMIN_TOKEN)", async () => {
    const env = makeEnv({ ADMIN_TOKEN: undefined });
    const sessionToken = await createSessionToken(env);
    const req = new Request("https://worker.example/admin", {
      method: "GET",
      headers: { Cookie: `admin_session=${encodeURIComponent(sessionToken)}` },
    });
    const res = await worker.fetch(req, env);
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
// POST /api/logout
// ---------------------------------------------------------------------------
describe("POST /api/logout", () => {
  it("redirects to /admin", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/logout", { method: "POST" }),
      makeEnv()
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
  });

  it("expires the session cookie", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/logout", { method: "POST" }),
      makeEnv()
    );
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("admin_session=;");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=0");
  });
});

// ---------------------------------------------------------------------------
// Auth: /api/match — demo token unlocks endpoint
// ---------------------------------------------------------------------------
describe("POST /api/match — auth", () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(MOCK_MATCHES) }] });
  });

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
  beforeEach(() => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(MOCK_MATCHES) }] });
  });

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
    expect(body.error).toBe("Internal server error.");
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
    expect(body.savedToKV).toBeUndefined();
    expect(env.APPLICATION_DRAFTS.put).toHaveBeenCalledOnce();
    const [kvKey, kvValue] = env.APPLICATION_DRAFTS.put.mock.calls[0];
    expect(kvKey).toBe("security-plan");
    const stored = JSON.parse(kvValue);
    expect(stored.draft).toBe(MOCK_DRAFT);
    expect(stored.sectionName).toBe("Security Plan");
    expect(stored.savedAt).toBeDefined();
  });

  it("does not call KV.put when KV binding absent", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Inventory Plan", task: "seed-to-sale" }, "/api/draft"),
      makeEnv({ APPLICATION_DRAFTS: undefined })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.savedToKV).toBeUndefined();
    expect(body.success).toBe(true);
  });

  it("passes claude-opus-4-8 to the SDK", async () => {
    const env = makeEnv();
    await worker.fetch(
      authedPost({ sectionName: "Staffing Plan", task: "background checks" }, "/api/draft"),
      env
    );
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-opus-4-8");
  });

  it("embeds sectionName and task in the generation prompt", async () => {
    const env = makeEnv();
    await worker.fetch(
      authedPost({ sectionName: "Waste Management", task: "compostable organics" }, "/api/draft"),
      env
    );
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
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
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
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

  it("includes max_tokens in config", async () => {
    await worker.fetch(
      authedPost({ sectionName: "Transport Plan", task: "GPS tracking" }, "/api/draft"),
      makeEnv()
    );
    const cfg = mockCreate.mock.calls[0][0];
    expect(cfg.max_tokens).toBeGreaterThan(0);
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
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "" }] });
    const res = await worker.fetch(
      authedPost({ sectionName: "Section B", task: "task B" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 500 when SDK throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Quota exceeded"));
    const res = await worker.fetch(
      authedPost({ sectionName: "Section C", task: "task C" }, "/api/draft"),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error.");
  });
});

// ---------------------------------------------------------------------------
// POST / — legacy endpoint (backward compat, no auth)
// ---------------------------------------------------------------------------
describe("POST / — legacy draft endpoint", () => {
  it("returns 401 when no auth provided", async () => {
    const res = await worker.fetch(
      post({ sectionName: "Section 1", task: "plan" }),
      makeEnv()
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when wrong bearer token provided", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Section 1", task: "plan" }, "/", "wrong-token"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with draft content", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Environmental Plan - Section 3.2", task: "LED plan" }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.draft).toBe(MOCK_DRAFT);
    expect(body.section).toBe("Environmental Plan - Section 3.2");
  });

  it("saves draft to KV", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      authedPost({ sectionName: "Security Plan", task: "24/7 camera coverage" }),
      env
    );
    const body = await res.json();
    expect(body.savedToKV).toBeUndefined();
    expect(env.APPLICATION_DRAFTS.put).toHaveBeenCalledOnce();
    const [kvKey, kvValue] = env.APPLICATION_DRAFTS.put.mock.calls[0];
    expect(kvKey).toBe("security-plan");
    const stored = JSON.parse(kvValue);
    expect(stored.draft).toBe(MOCK_DRAFT);
    expect(stored.sectionName).toBe("Security Plan");
    expect(stored.savedAt).toBeDefined();
  });

  it("does not call KV.put when KV binding is absent", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Inventory Plan", task: "seed-to-sale tracking" }),
      makeEnv({ APPLICATION_DRAFTS: undefined })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.savedToKV).toBeUndefined();
    expect(body.success).toBe(true);
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new Request("https://worker.example/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" },
      body: "not json",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid JSON/i);
  });

  it("returns 400 when sectionName is missing", async () => {
    const res = await worker.fetch(authedPost({ task: "some task" }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sectionName/i);
  });

  it("returns 400 when task is missing", async () => {
    const res = await worker.fetch(authedPost({ sectionName: "Environmental Plan" }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/task/i);
  });

  it("returns 400 when sectionName is blank whitespace", async () => {
    const res = await worker.fetch(authedPost({ sectionName: "   ", task: "something" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 when task is blank whitespace", async () => {
    const res = await worker.fetch(authedPost({ sectionName: "Section 1", task: "   " }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const res = await worker.fetch(
      authedPost({ sectionName: "Section 1", task: "plan" }),
      makeEnv({ ANTHROPIC_API_KEY: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });

  it("passes the correct model to the SDK", async () => {
    await worker.fetch(
      authedPost({ sectionName: "Staffing Plan", task: "background checks" }),
      makeEnv()
    );
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-opus-4-8");
  });

  it("embeds sectionName and task in the generation prompt", async () => {
    await worker.fetch(
      authedPost({ sectionName: "Waste Management", task: "compostable organic waste" }),
      makeEnv()
    );
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Waste Management");
    expect(prompt).toContain("compostable organic waste");
  });

  it("includes max_tokens in config", async () => {
    await worker.fetch(
      authedPost({ sectionName: "Transport Plan", task: "GPS tracking" }),
      makeEnv()
    );
    const cfg = mockCreate.mock.calls[0][0];
    expect(cfg.max_tokens).toBeGreaterThan(0);
  });

  it("sets CORS headers on 200 response", async () => {
    const res = await worker.fetch(authedPost({ sectionName: "Section A", task: "task A" }), makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 502 when Claude returns empty text", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "" }] });
    const res = await worker.fetch(
      authedPost({ sectionName: "Section B", task: "task B" }),
      makeEnv()
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 500 when SDK throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Quota exceeded"));
    const res = await worker.fetch(
      authedPost({ sectionName: "Section C", task: "task C" }),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error.");
  });

  it("returns 500 with generic message when SDK throws without message", async () => {
    mockCreate.mockRejectedValueOnce({});
    const res = await worker.fetch(
      authedPost({ sectionName: "Section D", task: "task D" }),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/chat — step length validation
// ---------------------------------------------------------------------------
describe("POST /api/chat — step validation", () => {
  it("returns 400 when step exceeds 300 characters", async () => {
    const res = await worker.fetch(
      authedPost({ step: "a".repeat(301), messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds maximum length/i);
  });

  it("accepts step at exactly 300 characters", async () => {
    const res = await worker.fetch(
      authedPost({ step: "a".repeat(300), messages: [] }, "/api/chat"),
      makeEnv()
    );
    // Not 400 — either 200 or 500 (SDK mock), but not a validation error
    expect(res.status).not.toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET + POST /api/session
// ---------------------------------------------------------------------------
describe("/api/session", () => {
  it("GET returns { state: null } when KV is absent", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/session", {
        headers: { Authorization: "Bearer secret-admin" },
      }),
      makeEnv({ APPLICATION_DRAFTS: undefined })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBeNull();
  });

  it("GET returns { state: null } when no saved state exists", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/session", {
        headers: { Authorization: "Bearer secret-admin" },
      }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBeNull();
  });

  it("POST saves state and GET returns it (round-trip)", async () => {
    const env = makeEnv();
    const state = { answers: { location: "Boston" }, step: 2, _matches: [] };

    const postRes = await worker.fetch(
      authedPost({ state }, "/api/session"),
      env
    );
    expect(postRes.status).toBe(200);
    expect((await postRes.json()).ok).toBe(true);

    // Verify KV.put was called with the right key shape and TTL
    expect(env.APPLICATION_DRAFTS.put).toHaveBeenCalledOnce();
    const [kvKey, kvValue, kvOpts] = env.APPLICATION_DRAFTS.put.mock.calls[0];
    expect(kvKey).toMatch(/^session:/);
    expect(JSON.parse(kvValue)).toEqual(state);
    expect(kvOpts.expirationTtl).toBe(3600);

    // Round-trip: GET should return the saved state
    const getRes = await worker.fetch(
      new Request("https://worker.example/api/session", {
        headers: { Authorization: "Bearer secret-admin" },
      }),
      env
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.state).toEqual(state);
  });

  it("GET returns { ok: true } when KV binding is absent on POST", async () => {
    const res = await worker.fetch(
      authedPost({ state: { step: 1 } }, "/api/session"),
      makeEnv({ APPLICATION_DRAFTS: undefined })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("GET returns 401 when unauthenticated", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/session"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when unauthenticated", async () => {
    const res = await worker.fetch(
      post({ state: {} }, "/api/session"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("POST returns 400 when state field is missing", async () => {
    const res = await worker.fetch(
      authedPost({}, "/api/session"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/state/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/chat — auth + happy path
// ---------------------------------------------------------------------------
describe("POST /api/chat — auth", () => {
  it("allows demo token when ADMIN_TOKEN is not set", async () => {
    const res = await worker.fetch(
      demoPost({ step: "Register your cooperative", messages: [] }, "/api/chat"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(200);
  });

  it("allows demo token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      demoPost({ step: "Register your cooperative", messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("allows real admin token", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register your cooperative", messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 for wrong token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register", messages: [] }, "/api/chat", "bad-token"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 when no token and ADMIN_TOKEN not configured", async () => {
    const res = await worker.fetch(
      post({ step: "Register", messages: [] }, "/api/chat"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ADMIN_TOKEN not configured/i);
  });
});

describe("POST /api/chat — validation", () => {
  it("returns 400 when step is missing", async () => {
    const res = await worker.fetch(
      authedPost({ messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/step/i);
  });

  it("returns 400 when step is not a string", async () => {
    const res = await worker.fetch(
      authedPost({ step: 42, messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/step/i);
  });

  it("returns 400 when step exceeds 300 characters", async () => {
    const res = await worker.fetch(
      authedPost({ step: "x".repeat(301), messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds maximum length/i);
  });

  it("accepts step at exactly 300 characters", async () => {
    const res = await worker.fetch(
      authedPost({ step: "x".repeat(300), messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).not.toBe(400);
  });

  it("returns 400 when messages is missing", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register" }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/messages/i);
  });

  it("returns 400 when messages is not an array", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register", messages: "not an array" }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/messages/i);
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new Request("https://worker.example/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" },
      body: "not json",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register your cooperative", messages: [] }, "/api/chat"),
      makeEnv({ ANTHROPIC_API_KEY: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });
});

describe("POST /api/chat — happy path", () => {
  const MOCK_REPLY = "To register your cooperative, file Articles of Organization with the Secretary of State.";

  beforeEach(() => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: MOCK_REPLY }] });
  });

  it("returns 200 with reply", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register your cooperative", messages: [{ role: "user", content: "How?" }] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reply).toBe(MOCK_REPLY);
  });

  it("uses claude-haiku-4-5-20251001 for fast responses", async () => {
    await worker.fetch(
      authedPost({ step: "Register your cooperative", messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("embeds the step in the system prompt", async () => {
    await worker.fetch(
      authedPost({ step: "File Articles of Organization", messages: [] }, "/api/chat"),
      makeEnv()
    );
    const systemPrompt = mockCreate.mock.calls[0][0].system;
    expect(systemPrompt).toContain("File Articles of Organization");
  });

  it("includes matchContext details in system prompt when provided", async () => {
    await worker.fetch(
      authedPost({
        step: "Open cooperative bank account",
        matchContext: {
          licenseType: "Adult-Use Cultivator",
          coopStructure: "Worker Cooperative",
          fitScore: 92,
          rationale: "Strong fit.",
        },
        messages: [],
      }, "/api/chat"),
      makeEnv()
    );
    const systemPrompt = mockCreate.mock.calls[0][0].system;
    expect(systemPrompt).toContain("Adult-Use Cultivator");
    expect(systemPrompt).toContain("Worker Cooperative");
    expect(systemPrompt).toContain("92");
  });

  it("passes conversation messages to the SDK", async () => {
    const messages = [
      { role: "user", content: "What do I do first?" },
      { role: "assistant", content: "Start by filing with the Secretary of State." },
      { role: "user", content: "What form do I use?" },
    ];
    await worker.fetch(
      authedPost({ step: "Register", messages }, "/api/chat"),
      makeEnv()
    );
    expect(mockCreate.mock.calls[0][0].messages).toEqual(messages);
  });

  it("caps max_tokens at 1024", async () => {
    await worker.fetch(
      authedPost({ step: "Register", messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(1024);
  });

  it("sets CORS headers on 200 response", async () => {
    const res = await worker.fetch(
      authedPost({ step: "Register", messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 500 when SDK throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Service unavailable"));
    const res = await worker.fetch(
      authedPost({ step: "Register", messages: [] }, "/api/chat"),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error.");
  });
});

// ---------------------------------------------------------------------------
// POST /api/parcel — auth + happy path
// ---------------------------------------------------------------------------
const VALID_PARCEL_BODY = {
  licenseType: "Adult-Use Cultivator",
  coopStructure: "Worker Cooperative",
  answers: { location: "worcester", capital: "250k_1m", experience: "5 years" },
};

describe("POST /api/parcel — auth", () => {
  it("allows demo token when ADMIN_TOKEN is not set", async () => {
    const res = await worker.fetch(
      demoPost(VALID_PARCEL_BODY, "/api/parcel"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(200);
  });

  it("allows demo token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      demoPost(VALID_PARCEL_BODY, "/api/parcel"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("allows real admin token", async () => {
    const res = await worker.fetch(
      authedPost(VALID_PARCEL_BODY, "/api/parcel"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 for wrong token when ADMIN_TOKEN is set", async () => {
    const res = await worker.fetch(
      authedPost(VALID_PARCEL_BODY, "/api/parcel", "bad-token"),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 when no token and ADMIN_TOKEN not configured", async () => {
    const res = await worker.fetch(
      post(VALID_PARCEL_BODY, "/api/parcel"),
      makeEnv({ ADMIN_TOKEN: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ADMIN_TOKEN not configured/i);
  });
});

describe("POST /api/parcel — validation", () => {
  it("returns 400 when licenseType is missing", async () => {
    const { licenseType: _, ...body } = VALID_PARCEL_BODY;
    const res = await worker.fetch(authedPost(body, "/api/parcel"), makeEnv());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/licenseType/i);
  });

  it("returns 400 when coopStructure is missing", async () => {
    const { coopStructure: _, ...body } = VALID_PARCEL_BODY;
    const res = await worker.fetch(authedPost(body, "/api/parcel"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 when answers is missing", async () => {
    const { answers: _, ...body } = VALID_PARCEL_BODY;
    const res = await worker.fetch(authedPost(body, "/api/parcel"), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 when answers is not an object", async () => {
    const res = await worker.fetch(
      authedPost({ ...VALID_PARCEL_BODY, answers: "not-an-object" }, "/api/parcel"),
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new Request("https://worker.example/api/parcel", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" },
      body: "not json",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    const res = await worker.fetch(
      authedPost(VALID_PARCEL_BODY, "/api/parcel"),
      makeEnv({ ANTHROPIC_API_KEY: undefined })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });
});

const MOCK_PARCEL_REPORT = "## 1. Permitted Zoning Districts\n\nIndustrial A zones typically permit cultivation...";

describe("POST /api/parcel — happy path", () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: MOCK_PARCEL_REPORT }] });
  });

  it("returns 200 with parcel report", async () => {
    const res = await worker.fetch(
      authedPost(VALID_PARCEL_BODY, "/api/parcel"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toBe(MOCK_PARCEL_REPORT);
  });

  it("uses claude-opus-4-8 for detailed analysis", async () => {
    await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-opus-4-8");
  });

  it("embeds licenseType in the user prompt", async () => {
    await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Adult-Use Cultivator");
  });

  it("embeds coopStructure in the user prompt", async () => {
    await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Worker Cooperative");
  });

  it("includes location from answers in the user prompt", async () => {
    await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("worcester");
  });

  it("includes a canopy sizing section for cultivation license types", async () => {
    await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt.toLowerCase()).toContain("canopy");
  });

  it("omits canopy section for non-cultivation license types", async () => {
    await worker.fetch(
      authedPost({ ...VALID_PARCEL_BODY, licenseType: "Delivery-Only Retailer" }, "/api/parcel"),
      makeEnv()
    );
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt.toLowerCase()).not.toContain("canopy");
  });

  it("sets max_tokens greater than zero", async () => {
    await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    expect(mockCreate.mock.calls[0][0].max_tokens).toBeGreaterThan(0);
  });

  it("sets CORS headers on 200 response", async () => {
    const res = await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 502 when Claude returns empty text", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "" }] });
    const res = await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 500 when SDK throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Overloaded"));
    const res = await worker.fetch(authedPost(VALID_PARCEL_BODY, "/api/parcel"), makeEnv());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error.");
  });
});
