import {
  ADMIN_AI_RESPONSE_JSON_SCHEMA,
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
  normalizeProviderResponse,
} from "./prompt";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
const PROVIDER_UNAVAILABLE_REASON = "Admin AI is not configured yet.";

type ProviderGenerateInput = {
  question: string;
  scope: AdminAiScope;
  queryPlan: AdminAiQueryPlan;
  candidates: ContactFactRow[];
  evidence: EvidenceItem[];
};

export interface AdminAiProvider {
  isConfigured(): boolean;
  getUnavailableReason(): string | null;
  generate(input: ProviderGenerateInput): Promise<{
    response: AdminAiResponse;
    modelMetadata: Record<string, unknown>;
  }>;
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

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
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

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getModel(),
        input: [
          {
            role: "system",
            content: buildAdminAiSystemPrompt(input.scope),
          },
          {
            role: "user",
            content: buildAdminAiUserPrompt(input),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "admin_ai_response",
            strict: true,
            schema: ADMIN_AI_RESPONSE_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const message = await parseErrorResponse(response);
      throw new Error(`OpenAI admin AI request failed: ${message}`);
    }

    const payload = await response.json() as OpenAiResponsesPayload;
    const rawText = extractResponseText(payload);
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
        model: payload.model ?? getModel(),
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
    model: isConfigured ? getModel() : null,
  };
}
