import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { buildSystemInstruction, buildPrompt } from "./index.js";

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK so tests never make real network calls
// ---------------------------------------------------------------------------
const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      stream: mockStream,
    },
  }));
  return { default: MockAnthropic };
});

const MOCK_DRAFT = "## Environmental Plan\n\nThis facility shall install...";

function makeFinalMessage(text = MOCK_DRAFT) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
  };
}

function makeStreamHandle(finalMsg) {
  return {
    finalMessage: vi.fn().mockResolvedValue(finalMsg),
  };
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
// Helpers
// ---------------------------------------------------------------------------
function makeEnv(overrides = {}) {
  return {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    APPLICATION_DRAFTS: makeKV(),
    ...overrides,
  };
}

function post(body, path = "/") {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
// Integration: CORS / routing
// ---------------------------------------------------------------------------
describe("OPTIONS preflight", () => {
  it("returns 200 with CORS headers", async () => {
    const res = await worker.fetch(options(), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("GET health-check", () => {
  it("returns status ok", async () => {
    const res = await worker.fetch(get(), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("unsupported method", () => {
  it("returns 405 for PUT", async () => {
    const req = new Request("https://worker.example/", { method: "PUT" });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Integration: input validation
// ---------------------------------------------------------------------------
describe("POST validation", () => {
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
    const res = await worker.fetch(
      post({ sectionName: "Environmental Plan" }),
      makeEnv()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/task/i);
  });

  it("returns 400 when sectionName is blank whitespace", async () => {
    const res = await worker.fetch(
      post({ sectionName: "   ", task: "something" }),
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when task is blank whitespace", async () => {
    const res = await worker.fetch(
      post({ sectionName: "Section 1", task: "   " }),
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const env = makeEnv({ ANTHROPIC_API_KEY: undefined });
    const res = await worker.fetch(
      post({ sectionName: "Section 1", task: "plan" }),
      env
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });
});

// ---------------------------------------------------------------------------
// Integration: happy path
// ---------------------------------------------------------------------------
describe("POST happy path", () => {
  it("returns 200 with draft content", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      post({ sectionName: "Environmental Plan - Section 3.2", task: "LED plan" }),
      env
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

    // Key is slug-ified section name
    const [kvKey, kvValue] = env.APPLICATION_DRAFTS.put.mock.calls[0];
    expect(kvKey).toBe("security-plan");
    const stored = JSON.parse(kvValue);
    expect(stored.draft).toBe(MOCK_DRAFT);
    expect(stored.sectionName).toBe("Security Plan");
    expect(stored.savedAt).toBeDefined();
  });

  it("reports savedToKV: false when KV binding is absent", async () => {
    const env = makeEnv({ APPLICATION_DRAFTS: undefined });
    const res = await worker.fetch(
      post({ sectionName: "Inventory Plan", task: "seed-to-sale tracking" }),
      env
    );
    const body = await res.json();
    expect(body.savedToKV).toBe(false);
  });

  it("passes the correct model to the SDK", async () => {
    const env = makeEnv();
    await worker.fetch(
      post({ sectionName: "Staffing Plan", task: "background checks" }),
      env
    );
    const callArg = mockStream.mock.calls[0][0];
    expect(callArg.model).toBe("claude-opus-4-8");
  });

  it("embeds sectionName and task in the generation prompt", async () => {
    const env = makeEnv();
    await worker.fetch(
      post({ sectionName: "Waste Management", task: "compostable organic waste" }),
      env
    );
    const callArg = mockStream.mock.calls[0][0];
    const promptText = callArg.messages[0].content;
    expect(promptText).toContain("Waste Management");
    expect(promptText).toContain("compostable organic waste");
  });

  it("includes max_tokens and thinking in config", async () => {
    const env = makeEnv();
    await worker.fetch(
      post({ sectionName: "Transport Plan", task: "GPS tracking" }),
      env
    );
    const callArg = mockStream.mock.calls[0][0];
    expect(callArg.max_tokens).toBeGreaterThan(0);
    expect(callArg.thinking).toEqual({ type: "adaptive" });
  });

  it("sets CORS headers on 200 response", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      post({ sectionName: "Section A", task: "task A" }),
      env
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// Integration: error handling
// ---------------------------------------------------------------------------
describe("error handling", () => {
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

  it("returns 500 with message when SDK throws without message", async () => {
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
