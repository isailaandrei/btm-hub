/**
 * Gated live smoke test for the DeepSeek admin-AI provider.
 *
 * Hits the REAL DeepSeek API with a tiny fabricated 2-card corpus and asserts
 * the provider returns a parseable, normalized response with DeepSeek metadata.
 *
 * Run:  RUN_DEEPSEEK_SMOKE=1 npx vitest run scripts/deepseek-smoke.test.ts
 *
 * Gated behind RUN_DEEPSEEK_SMOKE so the normal `npm run test:unit` suite never
 * runs it (it hits the network). Vitest is used only as a reliable TS+alias
 * runner. The API key is read straight from `.env.development.local` (not
 * process env), mirroring scripts/analyze-admin-ai-payload.test.ts; if it is
 * missing the test skips with a clear message instead of failing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deepSeekAdminAiProvider } from "@/lib/admin-ai/deepseek-provider";
import type { AdminAiSynthesisInput } from "@/lib/admin-ai/prompt";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function resolveApiKey(): { apiKey: string; env: Record<string, string> } {
  let env: Record<string, string> = {};
  try {
    env = loadEnv(".env.development.local");
  } catch {
    // File may not exist locally; the missing-key guard below handles it.
  }
  return { apiKey: env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "", env };
}

function applyBaseEnv(apiKey: string, env: Record<string, string>): void {
  process.env.DEEPSEEK_API_KEY = apiKey;
  if (env.DEEPSEEK_MODEL) process.env.DEEPSEEK_MODEL = env.DEEPSEEK_MODEL;
  if (env.DEEPSEEK_BASE_URL) process.env.DEEPSEEK_BASE_URL = env.DEEPSEEK_BASE_URL;
}

// Tiny (<2k token) fabricated corpus; "Alex Rivera" is the freediving mention.
const SMOKE_INPUT: AdminAiSynthesisInput = {
  question: "Which contact mentions freediving?",
  scope: "global",
  includeEvidence: false,
  queryPlan: {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["freediving"],
    requestedLimit: 25,
  },
  cards: [
    {
      contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contactName: "Alex Rivera",
      text: "Contact: Alex Rivera\n- Ultimate Vision: I want to teach freediving.",
      evidence: [],
    },
    {
      contactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      contactName: "Sam Okafor",
      text: "Contact: Sam Okafor\n- Ultimate Vision: I run scuba trips in warm water.",
      evidence: [],
    },
  ],
  evidence: [],
};

describe.runIf(process.env.RUN_DEEPSEEK_SMOKE === "1")("deepseek provider smoke", () => {
  it("returns a parsed, grounded response from the live DeepSeek API", async (ctx) => {
    const { apiKey, env } = resolveApiKey();
    if (!apiKey) {
      console.warn(
        "[deepseek-smoke] DEEPSEEK_API_KEY missing from .env.development.local — skipping live call",
      );
      ctx.skip();
      return;
    }
    applyBaseEnv(apiKey, env);

    const result = await deepSeekAdminAiProvider.generate(SMOKE_INPUT);

    expect(Array.isArray(result.response.uncertainty)).toBe(true);
    expect(result.modelMetadata.provider).toBe("deepseek");
    expect(result.modelMetadata.usage).toBeTruthy();
  }, 180_000);

  it("empirically checks json_object + thinking coexist (DEEPSEEK_THINKING=1)", async (ctx) => {
    const { apiKey, env } = resolveApiKey();
    if (!apiKey) {
      console.warn(
        "[deepseek-smoke] DEEPSEEK_API_KEY missing from .env.development.local — skipping live thinking call",
      );
      ctx.skip();
      return;
    }
    applyBaseEnv(apiKey, env);

    const originalThinking = process.env.DEEPSEEK_THINKING;
    process.env.DEEPSEEK_THINKING = "1";
    try {
      // If DeepSeek rejects response_format:json_object combined with thinking
      // mode it will 400, and generate() re-throws it via the http_error path —
      // this test then FAILS with the API's error text visible. That failure is
      // exactly the data point we want (~$0.001), so we do NOT soften it.
      const result = await deepSeekAdminAiProvider.generate(SMOKE_INPUT);
      expect(Array.isArray(result.response.uncertainty)).toBe(true);
      expect(result.modelMetadata.provider).toBe("deepseek");
    } finally {
      if (originalThinking === undefined) delete process.env.DEEPSEEK_THINKING;
      else process.env.DEEPSEEK_THINKING = originalThinking;
    }
  }, 180_000);
});
