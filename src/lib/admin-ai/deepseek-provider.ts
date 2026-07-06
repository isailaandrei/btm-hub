import {
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
  normalizeProviderResponse,
} from "./prompt";
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
import { parseOptionalBooleanEnv } from "./env";
import { printAdminAiRequestPayload } from "./payload-print";
import type { AdminAiProvider } from "./provider";
import type { AdminAiResponse } from "@/types/admin-ai";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
// Truncation mid-JSON is our worst failure mode (parse fail → retry → same
// truncation → hard error), and max_tokens is a ceiling, not a purchase — it
// costs nothing unless generated. Visible JSON runs ~1-2k tokens, but DeepSeek
// V4 emits reasoning tokens BY DEFAULT (observed up to ~8k) that share this
// budget, and exhaustive 25-entry shortlists push visible output toward 6-8k
// (largest observed completion so far: ~9.2k), so keep the ceiling generous.
const DEEPSEEK_MAX_OUTPUT_TOKENS = 32768;
// In explicit thinking mode the reasoning stream (`reasoning_content`) is also
// billed as output and shares this budget, so give it an even larger ceiling or
// a long chain-of-thought can truncate the trailing JSON.
const DEEPSEEK_THINKING_MAX_OUTPUT_TOKENS = 65536;
// Map/extraction (`completeJson`) emits small candidate lists, so the base cap
// is plenty and keeps each of the ~11 parallel chunk calls cheap.
const DEEPSEEK_MAP_MAX_OUTPUT_TOKENS = 16384;
const VALID_REASONING_EFFORTS = new Set(["high", "max"]);
// DeepSeek keeps the connection alive with keep-alives while it generates, so
// the timeout budget must cover FULL generation, not just time-to-first-byte:
// reduce calls over the candidate cohort demand large exhaustive outputs and
// have been observed to run past 180s. An aborted request is still billed, so
// this is deliberately generous rather than a retry trigger.
const DEEPSEEK_REQUEST_TIMEOUT_MS = 360_000;
const PROVIDER_UNAVAILABLE_REASON = "Admin AI is not configured yet.";

type DeepSeekChatCompletion = {
  id?: string;
  model?: string;
  choices?: Array<{
    // In thinking mode the chain-of-thought arrives in `reasoning_content`; the
    // final answer we parse stays in `content`.
    message?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string;
  }>;
  usage?: Record<string, unknown>;
};

type DeepSeekRawResponse = {
  assumptions?: string[];
  shortlist: AdminAiResponse["shortlist"] | [];
  additionalMatches?: Array<{
    contactId: string;
    contactName: string;
    reason: string;
  }>;
  contactAssessment: AdminAiResponse["contactAssessment"] | null;
  uncertainty: string[];
};

type ThinkingConfig = {
  enabled: boolean;
  reasoningEffort: "high" | "max" | null;
};

/**
 * Resolve thinking-mode config from env. `DEEPSEEK_REASONING_EFFORT` is only
 * honored (and only validated) when thinking is on; an unrecognized value is a
 * misconfiguration, so we fail loud rather than silently drop it.
 */
function resolveThinkingConfig(): ThinkingConfig {
  const enabled = parseOptionalBooleanEnv(process.env.DEEPSEEK_THINKING) ?? false;
  if (!enabled) return { enabled: false, reasoningEffort: null };

  const rawEffort = process.env.DEEPSEEK_REASONING_EFFORT?.trim();
  if (rawEffort && !VALID_REASONING_EFFORTS.has(rawEffort)) {
    throw new Error(
      `Invalid DEEPSEEK_REASONING_EFFORT "${rawEffort}". Expected "high" or "max".`,
    );
  }
  return {
    enabled: true,
    reasoningEffort: (rawEffort as "high" | "max" | undefined) ?? null,
  };
}

function getApiKey(): string | null {
  return process.env.DEEPSEEK_API_KEY?.trim() || null;
}

function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

function getBaseUrl(): string {
  const raw = process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL;
  // Strip trailing slashes so `${base}/chat/completions` never doubles up. The
  // override exists so the same code can later point at US/EU hosts serving
  // DeepSeek weights.
  return raw.replace(/\/+$/, "");
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message ?? response.statusText;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

/**
 * The provider only needs the light raw-shape handling the OpenAI provider does
 * (`shortlist` / `contactAssessment` / `uncertainty`) — `normalizeProviderResponse`
 * plus the orchestrator's Zod parse validate deeply afterwards. Returns `null`
 * when DeepSeek handed back empty/whitespace, non-JSON, or a JSON value missing
 * those keys, which is the retry signal.
 */
function parseDeepSeekContent(content: string): DeepSeekRawResponse | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    !("shortlist" in record) ||
    !("contactAssessment" in record) ||
    !Array.isArray(record.uncertainty)
  ) {
    return null;
  }
  return parsed as DeepSeekRawResponse;
}

async function callDeepSeek(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  scope: string;
  includeEvidence: boolean;
  systemPrompt: string;
  userPrompt: string;
  thinking: ThinkingConfig;
  maxTokens: number;
  // Sampling temperature. Omitted (undefined) leaves the API default (1.0) for
  // synthesis; extraction/planning callers pass 0 for deterministic output.
  temperature?: number;
  printPayload: boolean;
}): Promise<{ payload: DeepSeekChatCompletion; content: string }> {
  const timer = startAdminAiDebugTimer("deepseek-call", {
    model: input.model,
    thinking: input.thinking.enabled,
    reasoningEffort: input.thinking.reasoningEffort,
    systemPromptChars: input.systemPrompt.length,
    userPromptChars: input.userPrompt.length,
  });
  let response: Response;
  try {
    // DeepSeek context caching is fully automatic (prefix-unit based, no
    // cache-key/retention params), so the orchestrator's OpenAI-specific
    // `promptCacheKey` is intentionally NOT sent here. JSON output is requested
    // via `response_format: json_object` (DeepSeek has no strict json_schema);
    // the word "json" already appears in both prompts, as the API requires.
    //
    // Thinking mode (when enabled) keeps `response_format: json_object`: the
    // docs are ambiguous about whether the combination is supported, so we send
    // both and let a 400 surface loudly on the http_error path rather than
    // silently dropping the JSON constraint. Reasoning tokens share the output
    // budget, so callers pass a generous `maxTokens`.
    // DeepSeek V4 defaults reasoning ON (reasoning_effort "high"), and OMITTING
    // the `thinking` field accepts that default — it does NOT disable reasoning.
    // The hidden reasoning stream shares the max_tokens budget and dominates
    // generation latency (a large reduce call can burn 10-20k reasoning tokens =
    // minutes of wall clock) with no measured quality gain for this workload, so
    // we send `disabled` explicitly unless DEEPSEEK_THINKING turned it on.
    const requestBody = {
      model: input.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: input.maxTokens,
      // Only sent when a caller sets it (extraction/planning → 0). Synthesis
      // omits it so the API's tuned default stands.
      ...(input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
      stream: false,
      thinking: input.thinking.enabled
        ? { type: "enabled" }
        : { type: "disabled" },
      ...(input.thinking.enabled && input.thinking.reasoningEffort
        ? { reasoning_effort: input.thinking.reasoningEffort }
        : {}),
    };
    const requestBodyJson = JSON.stringify(requestBody);
    if (input.printPayload) {
      await printAdminAiRequestPayload({
        provider: "deepseek",
        model: input.model,
        scope: input.scope,
        includeEvidence: input.includeEvidence,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        // DeepSeek sends no JSON schema in the body (json_object mode), so report
        // an empty schema segment — nothing schema-shaped is billed.
        schema: {},
        schemaName: "json_object",
        requestBodyJson,
      });
    }
    response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: requestBodyJson,
      signal: AbortSignal.timeout(DEEPSEEK_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      timer.end({
        status: "timeout",
        timeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
      });
      throw new Error(
        `DeepSeek admin AI request timed out after ${DEEPSEEK_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    timer.end({
      status: "network_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    timer.end({
      status: "http_error",
      httpStatus: response.status,
      error: message,
    });
    throw new Error(`DeepSeek admin AI request failed: ${message}`);
  }

  // The body read sits outside the fetch try/catch above, but DeepSeek streams
  // keep-alives and returns headers early — so the AbortSignal can fire HERE,
  // during `response.json()`. Map that timeout to the descriptive error too,
  // never let the raw "operation was aborted" abort message surface.
  let payload: DeepSeekChatCompletion;
  try {
    payload = (await response.json()) as DeepSeekChatCompletion;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      timer.end({ status: "timeout", timeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS });
      throw new Error(
        `DeepSeek admin AI request timed out after ${DEEPSEEK_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    timer.end({
      status: "body_read_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  const message = payload.choices?.[0]?.message;
  const content = message?.content ?? "";
  const usage = payload.usage ?? {};
  timer.end({
    status: "ok",
    responseId: payload.id ?? null,
    usage: payload.usage ?? null,
    promptCacheHitTokens: usage.prompt_cache_hit_tokens ?? null,
    promptCacheMissTokens: usage.prompt_cache_miss_tokens ?? null,
    // Observability only — the reasoning stream is ignored for the response.
    reasoningChars: message?.reasoning_content?.length ?? null,
    outputChars: content.length,
  });
  return { payload, content };
}

type ParsedJsonEnvelope = { value: unknown };

/**
 * Parse arbitrary JSON content (any shape). Wrapped in an envelope so a valid
 * JSON `null` is distinguishable from the `null` retry signal. Returns `null`
 * only for empty/whitespace or unparseable content.
 */
function parseJsonContent(content: string): ParsedJsonEnvelope | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    return { value: JSON.parse(trimmed) };
  } catch {
    return null;
  }
}

/**
 * Shared call + parse core with a single retry on empty/unparseable content,
 * used by both `generate` (synthesis) and `completeJson` (map extraction) so the
 * fetch/timeout/error/retry handling lives in exactly one place. `parse` returns
 * `null` as the retry signal; a second failure throws (fail loud, no partials).
 */
async function requestDeepSeekJson<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  scope: string;
  includeEvidence: boolean;
  thinking: ThinkingConfig;
  maxTokens: number;
  temperature?: number;
  printPayload: boolean;
  parse: (content: string) => T | null;
}): Promise<{ payload: DeepSeekChatCompletion; parsed: T; model: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(PROVIDER_UNAVAILABLE_REASON);
  }
  const model = getDeepSeekModel();
  const callArgs = {
    apiKey,
    baseUrl: getBaseUrl(),
    model,
    scope: input.scope,
    includeEvidence: input.includeEvidence,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    thinking: input.thinking,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    printPayload: input.printPayload,
  };

  let { payload, content } = await callDeepSeek(callArgs);
  let parsed = input.parse(content);
  if (parsed === null) {
    // DeepSeek's json_object mode may occasionally return empty/invalid
    // content; the docs prescribe a single retry before failing loud.
    adminAiDebugLog("deepseek-empty-content-retry", {
      scope: input.scope,
      contentChars: content.length,
    });
    ({ payload, content } = await callDeepSeek(callArgs));
    parsed = input.parse(content);
    if (parsed === null) {
      throw new Error(
        "DeepSeek admin AI returned no valid JSON content after one retry",
      );
    }
  }
  return { payload, parsed, model };
}

export const deepSeekAdminAiProvider: AdminAiProvider = {
  isConfigured() {
    return Boolean(getApiKey());
  },

  getUnavailableReason() {
    return this.isConfigured() ? null : PROVIDER_UNAVAILABLE_REASON;
  },

  getModel() {
    return getDeepSeekModel();
  },

  async generate(input) {
    const includeEvidence = input.includeEvidence ?? true;
    // Resolve (and validate) thinking config up front so a bad reasoning-effort
    // fails before any network call rather than after the request is billed.
    const thinking = resolveThinkingConfig();
    const { payload, parsed, model } = await requestDeepSeekJson({
      systemPrompt: buildAdminAiSystemPrompt(input.scope, { includeEvidence }),
      userPrompt: buildAdminAiUserPrompt(input),
      scope: input.scope,
      includeEvidence,
      thinking,
      maxTokens: thinking.enabled
        ? DEEPSEEK_THINKING_MAX_OUTPUT_TOKENS
        : DEEPSEEK_MAX_OUTPUT_TOKENS,
      printPayload: true,
      parse: parseDeepSeekContent,
    });

    const normalized = normalizeProviderResponse(parsed, input.scope);
    adminAiDebugLog("synthesis-response", {
      scope: input.scope,
      shortlistCount: normalized.shortlist?.length ?? 0,
      hasContactAssessment: Boolean(normalized.contactAssessment),
      uncertaintyCount: normalized.uncertainty.length,
    });

    return {
      response: normalized,
      modelMetadata: {
        provider: "deepseek",
        responseId: payload.id ?? null,
        model: payload.model ?? model,
        // Raw DeepSeek usage carries `prompt_cache_hit_tokens` /
        // `prompt_cache_miss_tokens` verbatim for cache-economics tracking.
        usage: payload.usage ?? null,
      },
    };
  },

  async completeJson(input) {
    const { payload, parsed, model } = await requestDeepSeekJson({
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      scope: input.scope,
      includeEvidence: false,
      // Map/extraction calls NEVER use thinking mode regardless of
      // DEEPSEEK_THINKING — extraction must stay cheap and terse.
      thinking: { enabled: false, reasoningEffort: null },
      maxTokens: DEEPSEEK_MAP_MAX_OUTPUT_TOKENS,
      // Deterministic sampling for mechanical extraction/planning (map scan,
      // rescue scan, constraint planner). The API default (1.0) causes
      // run-to-run variance on what is a classification task — a card can be
      // selected one run and passed over the next.
      temperature: 0,
      // Per-chunk payload printing is intentionally not wired for map calls.
      printPayload: false,
      parse: parseJsonContent,
    });

    return {
      json: parsed.value,
      modelMetadata: {
        provider: "deepseek",
        responseId: payload.id ?? null,
        model: payload.model ?? model,
        usage: payload.usage ?? null,
      },
    };
  },
};
