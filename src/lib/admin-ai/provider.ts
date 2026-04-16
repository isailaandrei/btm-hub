import {
  ADMIN_AI_RANKING_RESPONSE_JSON_SCHEMA,
  ADMIN_AI_RESPONSE_JSON_SCHEMA,
  buildAdminAiRankingSystemPrompt,
  buildAdminAiRankingUserPrompt,
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
  normalizeProviderResponse,
  type AdminAiRankingInput,
  type AdminAiSynthesisInput,
} from "./prompt";
import type { AdminAiResponse } from "@/types/admin-ai";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_REQUEST_TIMEOUT_MS = 60_000;
const PROVIDER_UNAVAILABLE_REASON = "Admin AI is not configured yet.";

export interface AdminAiProvider {
  isConfigured(): boolean;
  getUnavailableReason(): string | null;
  generate(input: AdminAiSynthesisInput): Promise<{
    response: AdminAiResponse;
    modelMetadata: Record<string, unknown>;
  }>;
}

export type AdminAiRankingResult = {
  shortlistedContactIds: string[];
  reasons: Array<{ contactId: string; reason: string }>;
  cohortNotes: string | null;
  modelMetadata: Record<string, unknown>;
};

export interface AdminAiRankingProvider {
  isConfigured(): boolean;
  getUnavailableReason(): string | null;
  generateRanking(input: AdminAiRankingInput): Promise<AdminAiRankingResult>;
}

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

function getRankingModel(): string {
  return (
    process.env.OPENAI_RANKING_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL
  );
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
}): Promise<{
  payload: OpenAiResponsesPayload;
  rawText: string;
}> {
  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
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
      }),
      signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `OpenAI admin AI request timed out after ${OPENAI_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  }

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(`OpenAI admin AI request failed: ${message}`);
  }
  const payload = (await response.json()) as OpenAiResponsesPayload;
  return { payload, rawText: extractResponseText(payload) };
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
      systemPrompt: buildAdminAiSystemPrompt(input.scope),
      userPrompt: buildAdminAiUserPrompt(input),
      schemaName: "admin_ai_response",
      schema: ADMIN_AI_RESPONSE_JSON_SCHEMA,
    });

    const rawResponse = JSON.parse(rawText) as {
      summary: string;
      keyFindings: string[];
      shortlist: AdminAiResponse["shortlist"] | [];
      contactAssessment: AdminAiResponse["contactAssessment"] | null;
      uncertainty: string[];
    };

    return {
      response: normalizeProviderResponse(rawResponse),
      modelMetadata: {
        provider: "openai",
        responseId: payload.id ?? null,
        model: payload.model ?? model,
        usage: payload.usage ?? null,
      },
    };
  },
};

const openAiAdminAiRankingProvider: AdminAiRankingProvider = {
  isConfigured() {
    return Boolean(getApiKey());
  },

  getUnavailableReason() {
    return this.isConfigured() ? null : PROVIDER_UNAVAILABLE_REASON;
  },

  async generateRanking(input) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(PROVIDER_UNAVAILABLE_REASON);
    }
    const model = getRankingModel();
    const { payload, rawText } = await callOpenAi({
      apiKey,
      model,
      systemPrompt: buildAdminAiRankingSystemPrompt(),
      userPrompt: buildAdminAiRankingUserPrompt(input),
      schemaName: "admin_ai_ranking_response",
      schema: ADMIN_AI_RANKING_RESPONSE_JSON_SCHEMA,
    });

    const parsed = JSON.parse(rawText) as {
      shortlistedContactIds: string[];
      reasons: Array<{ contactId: string; reason: string }>;
      cohortNotes: string | null;
    };

    // Defense-in-depth: shortlisted ids must come from the ranking-card pool.
    const allowed = new Set(input.rankingCards.map((c) => c.contact_id));
    for (const id of parsed.shortlistedContactIds) {
      if (!allowed.has(id)) {
        throw new Error(
          `Ranking pass returned contactId not in cohort: ${id}`,
        );
      }
    }

    return {
      shortlistedContactIds: parsed.shortlistedContactIds,
      reasons: parsed.reasons,
      cohortNotes: parsed.cohortNotes ?? null,
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

export function getAdminAiRankingProvider(): AdminAiRankingProvider {
  return openAiAdminAiRankingProvider;
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
