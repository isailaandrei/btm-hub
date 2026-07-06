import { createHash } from "node:crypto";
import type { ConversationEmbeddingInput } from "@/lib/data/conversations";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_MESSAGE_EMBEDDING_VERSION = "message-v1";
const QUERY_EMBEDDING_VERSION = "query-v1";
const EMBEDDING_REQUEST_TIMEOUT_MS = 60_000;

type EmbeddingApiPayload = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
  model?: string;
  usage?: Record<string, unknown> | null;
};

function getEmbeddingApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

/**
 * Whether the OpenAI embeddings key is configured. Embeddings always run on
 * OpenAI (DeepSeek has no embedding endpoint), so the digest path uses this to
 * SKIP the embeddings pass (with disclosure) rather than throw when the key is
 * absent. A configured key that then fails at request time still throws.
 */
export function isEmbeddingConfigured(): boolean {
  return getEmbeddingApiKey() !== null;
}

export function hashEmbeddingContent(content: string, version: string): string {
  return createHash("sha256")
    .update(version)
    .update("\u0001")
    .update(content)
    .digest("hex");
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

async function requestEmbeddings(input: {
  apiKey: string;
  model: string;
  texts: string[];
}): Promise<EmbeddingApiPayload> {
  let response: Response;
  try {
    response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        input: input.texts,
      }),
      signal: AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `OpenAI embeddings request timed out after ${EMBEDDING_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  }

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(`OpenAI embeddings request failed: ${message}`);
  }

  return (await response.json()) as EmbeddingApiPayload;
}

export async function buildConversationEmbeddingRows(input: {
  messages: Array<{ id: string; body: string }>;
  model?: string;
  version?: string;
}): Promise<{
  rows: ConversationEmbeddingInput[];
  model: string;
  version: string;
  usage: Record<string, unknown> | null;
}> {
  if (input.messages.length === 0) {
    return {
      rows: [],
      model: input.model ?? DEFAULT_EMBEDDING_MODEL,
      version: input.version ?? DEFAULT_MESSAGE_EMBEDDING_VERSION,
      usage: null,
    };
  }

  const apiKey = getEmbeddingApiKey();
  if (!apiKey) throw new Error("OpenAI embeddings are not configured.");

  const model = input.model ?? DEFAULT_EMBEDDING_MODEL;
  const version = input.version ?? DEFAULT_MESSAGE_EMBEDDING_VERSION;
  const payload = await requestEmbeddings({
    apiKey,
    model,
    texts: input.messages.map((message) => message.body),
  });
  const embeddings = payload.data ?? [];
  if (embeddings.length !== input.messages.length) {
    throw new Error(
      `OpenAI embeddings response count mismatch: expected ${input.messages.length}, got ${embeddings.length}`,
    );
  }

  return {
    rows: input.messages.map((message, index) => ({
      targetType: "message",
      targetId: message.id,
      embeddingModel: payload.model ?? model,
      embeddingVersion: version,
      contentHash: hashEmbeddingContent(message.body, version),
      embedding: embeddings[index]?.embedding ?? [],
    })),
    model: payload.model ?? model,
    version,
    usage: payload.usage ?? null,
  };
}

export async function generateQueryEmbedding(input: {
  text: string;
  model?: string;
  version?: string;
}): Promise<{
  embedding: number[];
  model: string;
  version: string;
  usage: Record<string, unknown> | null;
}> {
  const apiKey = getEmbeddingApiKey();
  if (!apiKey) throw new Error("OpenAI embeddings are not configured.");
  const model = input.model ?? DEFAULT_EMBEDDING_MODEL;
  const version = input.version ?? QUERY_EMBEDDING_VERSION;
  const payload = await requestEmbeddings({
    apiKey,
    model,
    texts: [input.text],
  });
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("OpenAI embeddings response did not include a query vector.");
  }
  return {
    embedding,
    model: payload.model ?? model,
    version,
    usage: payload.usage ?? null,
  };
}
