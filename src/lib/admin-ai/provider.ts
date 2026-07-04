import {
  buildAdminAiResponseJsonSchema,
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
  normalizeProviderResponse,
  type AdminAiSynthesisInput,
} from "./prompt";
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
import { deepSeekAdminAiProvider } from "./deepseek-provider";
import { printAdminAiRequestPayload } from "./payload-print";
import type { AdminAiResponse } from "@/types/admin-ai";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
// Global-scope prompts run to hundreds of thousands of tokens; prefill alone
// can take well over a minute on the large-context model, and an aborted
// request is still billed — so keep this generous.
const OPENAI_REQUEST_TIMEOUT_MS = 180_000;
const PROVIDER_UNAVAILABLE_REASON = "Admin AI is not configured yet.";

export interface AdminAiProvider {
  isConfigured(): boolean;
  getUnavailableReason(): string | null;
  /**
   * The synthesis model id this provider would use for the next request.
   * Optional so lightweight test doubles need not implement it; both shipped
   * providers (OpenAI, DeepSeek) always do, and availability reporting prefers
   * it (see `getAdminAiProviderAvailability`).
   */
  getModel?(): string;
  generate(input: AdminAiSynthesisInput): Promise<{
    response: AdminAiResponse;
    modelMetadata: Record<string, unknown>;
  }>;
  /**
   * Low-level JSON completion used by the map stage of the map-reduce scan.
   * Parses the model's response as JSON of any shape (callers Zod-validate);
   * optional so only providers that support the scan implement it (DeepSeek).
   */
  completeJson?(input: {
    systemPrompt: string;
    userPrompt: string;
    scope: string;
  }): Promise<{ json: unknown; modelMetadata: Record<string, unknown> }>;
};

export type AdminAiProviderAvailability = {
  isConfigured: boolean;
  unavailableReason: string | null;
  model: string | null;
};

type OpenAiResponseItem = {
  type?: string;
  content?: Array<
    | { type?: "output_text"; text?: string }
    | { type?: "refusal"; refusal?: string }
  >;
};

type OpenAiResponsesPayload = {
  id?: string;
  model?: string;
  output?: OpenAiResponseItem[];
  usage?: Record<string, unknown>;
};

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getSynthesisModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function getGlobalPromptCacheRetention(): string | null {
  return process.env.OPENAI_GLOBAL_PROMPT_CACHE_RETENTION?.trim() || null;
}

function extractResponseText(payload: OpenAiResponsesPayload): string {
  const textParts: string[] = [];
  const refusalParts: string[] = [];

  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        textParts.push(content.text);
      } else if (
        content.type === "refusal" &&
        typeof content.refusal === "string"
      ) {
        refusalParts.push(content.refusal);
      }
    }
  }

  if (textParts.length > 0) return textParts.join("\n");
  if (refusalParts.length > 0) {
    throw new Error(`Model refused structured response: ${refusalParts.join(" ")}`);
  }
  throw new Error("Provider returned no structured response text");
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const payload = await response.json() as {
      error?: { message?: string };
    };
    return payload.error?.message ?? response.statusText;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

async function callOpenAi(input: {
  apiKey: string;
  model: string;
  scope: string;
  includeEvidence: boolean;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: object;
  promptCacheKey?: string | null;
  promptCacheRetention?: string | null;
}): Promise<{
  payload: OpenAiResponsesPayload;
  rawText: string;
}> {
  const timer = startAdminAiDebugTimer("openai-call", {
    model: input.model,
    schemaName: input.schemaName,
    systemPromptChars: input.systemPrompt.length,
    userPromptChars: input.userPrompt.length,
  });
  let response: Response;
  try {
    const requestBody = {
      model: input.model,
      ...(input.promptCacheKey ? { prompt_cache_key: input.promptCacheKey } : {}),
      ...(input.promptCacheRetention
        ? { prompt_cache_retention: input.promptCacheRetention }
        : {}),
      input: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    };
    const requestBodyJson = JSON.stringify(requestBody);
    await printAdminAiRequestPayload({
      provider: "openai",
      model: input.model,
      scope: input.scope,
      includeEvidence: input.includeEvidence,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      schema: input.schema,
      schemaName: input.schemaName,
      requestBodyJson,
    });
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: requestBodyJson,
      signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      timer.end({
        status: "timeout",
        timeoutMs: OPENAI_REQUEST_TIMEOUT_MS,
      });
      throw new Error(
        `OpenAI admin AI request timed out after ${OPENAI_REQUEST_TIMEOUT_MS / 1000}s`,
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
    throw new Error(`OpenAI admin AI request failed: ${message}`);
  }
  // The body read sits outside the fetch try/catch above; the AbortSignal can
  // fire HERE during `response.json()`, so map that timeout to the descriptive
  // error too rather than leaking the raw "operation was aborted" message.
  let payload: OpenAiResponsesPayload;
  try {
    payload = (await response.json()) as OpenAiResponsesPayload;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      timer.end({ status: "timeout", timeoutMs: OPENAI_REQUEST_TIMEOUT_MS });
      throw new Error(
        `OpenAI admin AI request timed out after ${OPENAI_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    timer.end({
      status: "body_read_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  const rawText = extractResponseText(payload);
  timer.end({
    status: "ok",
    responseId: payload.id ?? null,
    usage: payload.usage ?? null,
    outputChars: rawText.length,
  });
  return { payload, rawText };
}

const openAiAdminAiProvider: AdminAiProvider = {
  isConfigured() {
    return Boolean(getApiKey());
  },

  getUnavailableReason() {
    return this.isConfigured() ? null : PROVIDER_UNAVAILABLE_REASON;
  },

  getModel() {
    return getSynthesisModel();
  },

  async generate(input) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(PROVIDER_UNAVAILABLE_REASON);
    }
    const model = getSynthesisModel();
    const { payload, rawText } = await callOpenAi({
      apiKey,
      model,
      scope: input.scope,
      includeEvidence: input.includeEvidence ?? true,
      systemPrompt: buildAdminAiSystemPrompt(input.scope, {
        includeEvidence: input.includeEvidence ?? true,
      }),
      userPrompt: buildAdminAiUserPrompt(input),
      schemaName: "admin_ai_response",
      schema: buildAdminAiResponseJsonSchema({
        includeEvidence: input.includeEvidence ?? true,
      }),
      promptCacheKey: input.promptCacheKey ?? null,
      promptCacheRetention:
        input.scope === "global" ? getGlobalPromptCacheRetention() : null,
    });

    const rawResponse = JSON.parse(rawText) as {
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
    const normalized = normalizeProviderResponse(rawResponse, input.scope);
    adminAiDebugLog("synthesis-response", {
      scope: input.scope,
      shortlistCount: normalized.shortlist?.length ?? 0,
      hasContactAssessment: Boolean(normalized.contactAssessment),
      uncertaintyCount: normalized.uncertainty.length,
    });

    return {
      response: normalized,
      modelMetadata: {
        provider: "openai",
        responseId: payload.id ?? null,
        model: payload.model ?? model,
        usage: payload.usage ?? null,
      },
    };
  },
};

function getSelectedProviderName(): string {
  return process.env.ADMIN_AI_PROVIDER?.trim().toLowerCase() || "openai";
}

export type AdminAiScanMode = "single" | "map_reduce";

export function getAdminAiScanMode(): AdminAiScanMode {
  const selected = process.env.ADMIN_AI_SCAN_MODE?.trim().toLowerCase() || "single";
  if (selected === "single") return "single";
  if (selected === "map_reduce") return "map_reduce";
  // Fail loud (never fake): an unknown scan mode is a misconfiguration.
  throw new Error(
    `Unknown ADMIN_AI_SCAN_MODE "${process.env.ADMIN_AI_SCAN_MODE}". Expected "single" or "map_reduce".`,
  );
}

export function getAdminAiProvider(): AdminAiProvider {
  const selected = getSelectedProviderName();
  if (selected === "openai") return openAiAdminAiProvider;
  if (selected === "deepseek") return deepSeekAdminAiProvider;
  // Fail loud (never fake): an unknown provider is a misconfiguration, not a
  // reason to silently fall back to a default and bill the wrong API.
  throw new Error(
    `Unknown ADMIN_AI_PROVIDER "${process.env.ADMIN_AI_PROVIDER}". Expected "openai" or "deepseek".`,
  );
}

export function getAdminAiProviderAvailability(): AdminAiProviderAvailability {
  const provider = getAdminAiProvider();
  const isConfigured = provider.isConfigured();

  return {
    isConfigured,
    unavailableReason: provider.getUnavailableReason(),
    // Report the ACTIVE provider's model. Both shipped providers implement
    // getModel(); the getSynthesisModel() fallback only guards test doubles
    // that omit it (they never reach this configured branch in practice).
    model: isConfigured ? provider.getModel?.() ?? getSynthesisModel() : null,
  };
}
