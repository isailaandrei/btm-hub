import {
  buildAdminAiResponseJsonSchema,
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
  normalizeProviderResponse,
  type AdminAiSynthesisInput,
} from "./prompt";
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
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
  generate(input: AdminAiSynthesisInput): Promise<{
    response: AdminAiResponse;
    modelMetadata: Record<string, unknown>;
  }>;
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

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  return null;
}

function shouldPrintOpenAiRequestPayload(): boolean {
  const explicit = parseBooleanEnv(process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD);
  if (explicit !== null) return explicit;
  return process.env.NODE_ENV === "development";
}

function printOpenAiRequestPayload(input: {
  model: string;
  schemaName: string;
  requestBodyJson: string;
}): void {
  if (!shouldPrintOpenAiRequestPayload()) return;
  console.info("[admin-ai][openai-request-payload] begin", {
    model: input.model,
    schemaName: input.schemaName,
    chars: input.requestBodyJson.length,
  });
  console.info(input.requestBodyJson);
  console.info("[admin-ai][openai-request-payload] end");
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
    printOpenAiRequestPayload({
      model: input.model,
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
  const payload = (await response.json()) as OpenAiResponsesPayload;
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

  async generate(input) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(PROVIDER_UNAVAILABLE_REASON);
    }
    const model = getSynthesisModel();
    const { payload, rawText } = await callOpenAi({
      apiKey,
      model,
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
      shortlist: AdminAiResponse["shortlist"] | [];
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

export function getAdminAiProvider(): AdminAiProvider {
  return openAiAdminAiProvider;
}

export function getAdminAiProviderAvailability(): AdminAiProviderAvailability {
  const provider = getAdminAiProvider();
  const isConfigured = provider.isConfigured();

  return {
    isConfigured,
    unavailableReason: provider.getUnavailableReason(),
    model: isConfigured ? getSynthesisModel() : null,
  };
}
