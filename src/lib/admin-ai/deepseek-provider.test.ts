import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deepSeekAdminAiProvider } from "./deepseek-provider";
import { getAdminAiProvider } from "./provider";
import type { AdminAiSynthesisInput } from "./prompt";
import type { AdminAiQueryPlan } from "@/types/admin-ai";

// The payload-print path dumps raw prompts to disk; keep tests hermetic even
// though it stays gated off (ADMIN_AI_PRINT_OPENAI_PAYLOAD unset) here.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

const ORIGINAL_DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ORIGINAL_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL;
const ORIGINAL_DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL;
const ORIGINAL_ADMIN_AI_PROVIDER = process.env.ADMIN_AI_PROVIDER;
const ORIGINAL_DEEPSEEK_THINKING = process.env.DEEPSEEK_THINKING;
const ORIGINAL_DEEPSEEK_REASONING_EFFORT = process.env.DEEPSEEK_REASONING_EFFORT;

function restore(name: string, original: string | undefined) {
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}

function makePlan(): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
  };
}

function makeGenerateInput(
  scope: "global" | "contact" = "global",
): AdminAiSynthesisInput {
  return {
    question: "Find mission-driven candidates",
    scope,
    queryPlan: makePlan(),
    // Ignored by the DeepSeek provider — assert it never reaches the body.
    promptCacheKey: "admin-ai-cards:global",
    cards: [
      {
        contactId: CONTACT_ID,
        contactName: "Marina Costa",
        text: "Contact: Marina Costa\n- Ultimate Vision: Ocean stories. [e1]",
        evidence: [],
      },
    ],
    evidence: [],
  };
}

const OK_PAYLOAD = {
  shortlist: [
    {
      contactId: CONTACT_ID,
      contactName: "Marina Costa",
      whyFit: ["Mission-driven fit"],
      concerns: [],
      citations: [{ evidenceId: "e1", claimKey: "shortlist.0.whyFit.0" }],
    },
  ],
  contactAssessment: null,
  uncertainty: [],
};

function makeCompletionResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      id: "chatcmpl_test",
      model: "deepseek-v4-flash",
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 64,
        prompt_cache_miss_tokens: 36,
      },
    }),
  };
}

function makeOkFetchMock() {
  return vi.fn().mockResolvedValue(makeCompletionResponse(JSON.stringify(OK_PAYLOAD)));
}

function parseBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
    model?: string;
    messages?: Array<{ role?: string; content?: string }>;
    response_format?: { type?: string };
    max_tokens?: number;
    prompt_cache_key?: string;
    thinking?: { type?: string };
    reasoning_effort?: string;
    temperature?: number;
    top_p?: number;
  };
}

describe("deepSeekAdminAiProvider", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.ADMIN_AI_PROVIDER;
    delete process.env.DEEPSEEK_THINKING;
    delete process.env.DEEPSEEK_REASONING_EFFORT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    restore("DEEPSEEK_API_KEY", ORIGINAL_DEEPSEEK_API_KEY);
    restore("DEEPSEEK_MODEL", ORIGINAL_DEEPSEEK_MODEL);
    restore("DEEPSEEK_BASE_URL", ORIGINAL_DEEPSEEK_BASE_URL);
    restore("ADMIN_AI_PROVIDER", ORIGINAL_ADMIN_AI_PROVIDER);
    restore("DEEPSEEK_THINKING", ORIGINAL_DEEPSEEK_THINKING);
    restore("DEEPSEEK_REASONING_EFFORT", ORIGINAL_DEEPSEEK_REASONING_EFFORT);
  });

  it("is not configured and refuses to generate without DEEPSEEK_API_KEY", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchMock = makeOkFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    expect(deepSeekAdminAiProvider.isConfigured()).toBe(false);
    await expect(
      deepSeekAdminAiProvider.generate(makeGenerateInput()),
    ).rejects.toThrow("Admin AI is not configured yet.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the default DeepSeek endpoint with json_object mode and no cache key", async () => {
    const fetchMock = makeOkFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await deepSeekAdminAiProvider.generate(makeGenerateInput("global"));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    const body = parseBody(fetchMock);
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(32768);
    // Reasoning is explicitly disabled by default (omission would accept
    // DeepSeek's reasoning-on default), and no reasoning_effort is sent.
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body).not.toHaveProperty("reasoning_effort");
    // Cache key is OpenAI-only; DeepSeek caching is automatic and unkeyed.
    expect(body).not.toHaveProperty("prompt_cache_key");
    // Synthesis omits temperature so the API's tuned default (1.0) stands.
    expect(body).not.toHaveProperty("temperature");

    const systemMessage = body.messages?.find((m) => m.role === "system");
    const userMessage = body.messages?.find((m) => m.role === "user");
    expect(systemMessage?.content).toContain("raw contact cards");
    expect(systemMessage?.content).toContain("Return valid JSON");
    expect(userMessage?.content).toContain("\"rawContactCards\"");
    expect(userMessage?.content).toContain("Contact: Marina Costa");
  });

  it("respects DEEPSEEK_MODEL and a trailing-slashed DEEPSEEK_BASE_URL override", async () => {
    process.env.DEEPSEEK_MODEL = "deepseek-v4-pro";
    process.env.DEEPSEEK_BASE_URL = "https://custom.example.com/";
    const fetchMock = makeOkFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await deepSeekAdminAiProvider.generate(makeGenerateInput());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://custom.example.com/chat/completions",
    );
    expect(parseBody(fetchMock).model).toBe("deepseek-v4-pro");
  });

  it("parses message content and returns normalized response + cache-split usage", async () => {
    const fetchMock = makeOkFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deepSeekAdminAiProvider.generate(
      makeGenerateInput("global"),
    );

    expect(result.response.shortlist?.[0]?.citations).toEqual([
      { evidenceId: "e1", claimKey: "shortlist.0.whyFit.0" },
    ]);
    expect(result.modelMetadata).toMatchObject({
      provider: "deepseek",
      responseId: "chatcmpl_test",
      model: "deepseek-v4-flash",
    });
    const usage = result.modelMetadata.usage as Record<string, unknown>;
    expect(usage.prompt_cache_hit_tokens).toBe(64);
    expect(usage.prompt_cache_miss_tokens).toBe(36);
  });

  it("retries once on empty content, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeCompletionResponse(""))
      .mockResolvedValueOnce(makeCompletionResponse(JSON.stringify(OK_PAYLOAD)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deepSeekAdminAiProvider.generate(makeGenerateInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.shortlist?.[0]?.contactName).toBe("Marina Costa");
  });

  it("throws after a second empty/invalid response (exactly two calls)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeCompletionResponse(""))
      .mockResolvedValueOnce(makeCompletionResponse("not json at all"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deepSeekAdminAiProvider.generate(makeGenerateInput()),
    ).rejects.toThrow("no valid JSON content after one retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the DeepSeek error message on a non-retryable HTTP failure without retrying", async () => {
    // 400 is neither 429 nor 5xx, so it must fail on the first attempt —
    // retrying a bad request just burns the same error three times.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "Invalid request" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deepSeekAdminAiProvider.generate(makeGenerateInput()),
    ).rejects.toThrow("Invalid request");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("HTTP status retry (429/5xx)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries on 429 then 503 (jittered backoff, floor >= 2s) and succeeds on the third attempt", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          json: async () => ({ error: { message: "Rate limit reached" } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: async () => ({ error: { message: "Upstream overloaded" } }),
        })
        .mockResolvedValueOnce(makeCompletionResponse(JSON.stringify(OK_PAYLOAD)));
      vi.stubGlobal("fetch", fetchMock);

      const promise = deepSeekAdminAiProvider.generate(makeGenerateInput());

      // Backoff floor is 2s — well under that, no retry should have fired yet.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Two retries, each capped at 8s, comfortably finish within 20s total.
      await vi.advanceTimersByTimeAsync(19_000);
      const result = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.response.shortlist?.[0]?.contactName).toBe("Marina Costa");
    });

    it("exhausts the retry budget on repeated 429s and fails loud with the status in the error", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: { message: "Rate limit reached" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const outcome = deepSeekAdminAiProvider
        .generate(makeGenerateInput())
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await outcome;

      // 1 initial attempt + 2 retries = 3 total, never a 4th.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect((result.error as Error).message).toContain("HTTP 429");
        expect((result.error as Error).message).toContain("Rate limit reached");
      }
    });
  });

  it("maps a timeout during the response body read to the descriptive error", async () => {
    // DeepSeek returns headers early (keep-alives), so the AbortSignal can fire
    // during response.json(); that must surface as our timeout message, not the
    // raw "operation was aborted due to timeout" abort text.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deepSeekAdminAiProvider.generate(makeGenerateInput()),
    ).rejects.toThrow("DeepSeek admin AI request timed out after 360s");
    // A body-read timeout is not an empty-content case, so no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("thinking mode", () => {
    it("adds thinking + a larger token cap and keeps json_object with no sampling params", async () => {
      process.env.DEEPSEEK_THINKING = "1";
      const fetchMock = makeOkFetchMock();
      vi.stubGlobal("fetch", fetchMock);

      await deepSeekAdminAiProvider.generate(makeGenerateInput());

      const body = parseBody(fetchMock);
      expect(body.thinking).toEqual({ type: "enabled" });
      expect(body.max_tokens).toBe(65536);
      // JSON constraint is deliberately kept even though the docs are ambiguous
      // about the json_object + thinking combination.
      expect(body.response_format).toEqual({ type: "json_object" });
      // Sampling params are unsupported in thinking mode and we send none.
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
    });

    it("sends reasoning_effort when set alongside thinking", async () => {
      process.env.DEEPSEEK_THINKING = "1";
      process.env.DEEPSEEK_REASONING_EFFORT = "max";
      const fetchMock = makeOkFetchMock();
      vi.stubGlobal("fetch", fetchMock);

      await deepSeekAdminAiProvider.generate(makeGenerateInput());

      expect(parseBody(fetchMock).reasoning_effort).toBe("max");
    });

    it("throws on an invalid DEEPSEEK_REASONING_EFFORT before any request", async () => {
      process.env.DEEPSEEK_THINKING = "1";
      process.env.DEEPSEEK_REASONING_EFFORT = "banana";
      const fetchMock = makeOkFetchMock();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        deepSeekAdminAiProvider.generate(makeGenerateInput()),
      ).rejects.toThrow(/banana/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("parses content even when reasoning_content is present", async () => {
      process.env.DEEPSEEK_THINKING = "1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "chatcmpl_reasoning",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                reasoning_content: "Let me think about who fits...",
                content: JSON.stringify(OK_PAYLOAD),
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100 },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await deepSeekAdminAiProvider.generate(makeGenerateInput());

      expect(result.response.shortlist?.[0]?.contactName).toBe("Marina Costa");
      expect(result.modelMetadata.provider).toBe("deepseek");
    });
  });

  describe("getAdminAiProvider routing", () => {
    it("routes to the DeepSeek provider when ADMIN_AI_PROVIDER=deepseek", () => {
      process.env.ADMIN_AI_PROVIDER = "deepseek";
      expect(getAdminAiProvider()).toBe(deepSeekAdminAiProvider);
    });

    it("routes to OpenAI when ADMIN_AI_PROVIDER is unset or 'openai'", () => {
      delete process.env.ADMIN_AI_PROVIDER;
      expect(getAdminAiProvider()).not.toBe(deepSeekAdminAiProvider);
      process.env.ADMIN_AI_PROVIDER = "openai";
      expect(getAdminAiProvider()).not.toBe(deepSeekAdminAiProvider);
    });

    it("throws on an unknown ADMIN_AI_PROVIDER value", () => {
      process.env.ADMIN_AI_PROVIDER = "anthropic";
      expect(() => getAdminAiProvider()).toThrow(/Unknown ADMIN_AI_PROVIDER/);
    });
  });

  describe("completeJson", () => {
    const MAP_CONTENT = JSON.stringify({
      candidates: [
        {
          contactId: CONTACT_ID,
          contactName: "Marina Costa",
          evidenceSummary: "Call note: has her own project in mind.",
        },
      ],
    });

    function completeJsonInput() {
      return {
        systemPrompt: "You extract candidates. Return JSON.",
        userPrompt: '{"rawContactCards":[],"question":"who?"}',
        scope: "global" as const,
      };
    }

    it("posts json_object mode at the map cap with reasoning disabled", async () => {
      // Even with thinking globally enabled, map/extraction calls must not think.
      process.env.DEEPSEEK_THINKING = "1";
      const fetchMock = vi
        .fn()
        .mockResolvedValue(makeCompletionResponse(MAP_CONTENT));
      vi.stubGlobal("fetch", fetchMock);

      await deepSeekAdminAiProvider.completeJson!(completeJsonInput());

      const body = parseBody(fetchMock);
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.max_tokens).toBe(16384);
      // Map calls explicitly disable reasoning even when DEEPSEEK_THINKING=1.
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body).not.toHaveProperty("reasoning_effort");
      // Deterministic extraction: temperature pinned to 0.
      expect(body.temperature).toBe(0);
      const systemMessage = body.messages?.find((m) => m.role === "system");
      const userMessage = body.messages?.find((m) => m.role === "user");
      expect(systemMessage?.content).toBe("You extract candidates. Return JSON.");
      expect(userMessage?.content).toContain("rawContactCards");
    });

    it("returns the parsed JSON (any shape) and DeepSeek usage metadata", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(makeCompletionResponse(MAP_CONTENT));
      vi.stubGlobal("fetch", fetchMock);

      const result = await deepSeekAdminAiProvider.completeJson!(
        completeJsonInput(),
      );

      expect(result.json).toEqual(JSON.parse(MAP_CONTENT));
      expect(result.modelMetadata).toMatchObject({
        provider: "deepseek",
        responseId: "chatcmpl_test",
        model: "deepseek-v4-flash",
      });
      const usage = result.modelMetadata.usage as Record<string, unknown>;
      expect(usage.prompt_cache_hit_tokens).toBe(64);
      expect(usage.prompt_cache_miss_tokens).toBe(36);
    });

    it("retries once on empty content, then succeeds", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(makeCompletionResponse(""))
        .mockResolvedValueOnce(makeCompletionResponse(MAP_CONTENT));
      vi.stubGlobal("fetch", fetchMock);

      const result = await deepSeekAdminAiProvider.completeJson!(
        completeJsonInput(),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.json).toEqual(JSON.parse(MAP_CONTENT));
    });

    it("retries on HTTP 5xx and succeeds — same status-retry wrapper as generate()", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: async () => ({ error: { message: "boom" } }),
        })
        .mockResolvedValueOnce(makeCompletionResponse(MAP_CONTENT));
      vi.stubGlobal("fetch", fetchMock);

      const promise = deepSeekAdminAiProvider.completeJson!(completeJsonInput());
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.json).toEqual(JSON.parse(MAP_CONTENT));
      vi.useRealTimers();
    });
  });
});
