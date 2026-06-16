import type { ExtractedConversationFact } from "./facts";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4";
const REQUEST_TIMEOUT_MS = 60_000;

export type ConversationDigestExtraction = {
  summary: string;
  facts: ExtractedConversationFact[];
  model: string;
};

const DIGEST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldKey: { anyOf: [{ type: "string" }, { type: "null" }] },
          valueText: { type: "string" },
          valueJson: { type: "null" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          conflictGroup: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: [
          "fieldKey",
          "valueText",
          "valueJson",
          "confidence",
          "conflictGroup",
        ],
      },
    },
  },
  required: ["summary", "facts"],
} as const;

type OpenAiResponsePayload = {
  id?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
};

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getModel(): string {
  return process.env.OPENAI_CONVERSATION_DIGEST_MODEL?.trim()
    || process.env.OPENAI_MODEL?.trim()
    || DEFAULT_MODEL;
}

function extractText(payload: OpenAiResponsePayload): string {
  const text: string[] = [];
  const refusals: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        text.push(content.text);
      }
      if (content.type === "refusal" && typeof content.refusal === "string") {
        refusals.push(content.refusal);
      }
    }
  }
  if (text.length > 0) return text.join("\n");
  if (refusals.length > 0) {
    throw new Error(`Conversation digest model refused: ${refusals.join(" ")}`);
  }
  throw new Error("Conversation digest model returned no structured text.");
}

export async function extractConversationDigest(input: {
  transcript: string;
}): Promise<ConversationDigestExtraction> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OpenAI conversation digest is not configured.");
  const model = getModel();
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            "Summarize this WhatsApp conversation window for CRM memory.",
            "Extract only durable facts stated in the messages.",
            "Facts are append-only. If values conflict, keep both facts with the same conflictGroup.",
            "Return JSON matching the schema.",
          ].join(" "),
        },
        { role: "user", content: input.transcript },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "conversation_digest",
          strict: true,
          schema: DIGEST_JSON_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Conversation digest model failed: ${response.statusText}`);
  }
  const payload = (await response.json()) as OpenAiResponsePayload;
  const parsed = JSON.parse(extractText(payload)) as {
    summary: string;
    facts: ExtractedConversationFact[];
  };
  return {
    summary: parsed.summary,
    facts: parsed.facts,
    model: payload.model ?? model,
  };
}
