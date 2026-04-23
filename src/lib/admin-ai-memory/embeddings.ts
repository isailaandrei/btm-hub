import { createHash } from "crypto";
import { buildEmbeddingContentForSubchunk } from "./subchunk-builder";
import { buildStableChunkId } from "./chunk-identity";
import type {
  CrmAiEmbeddingInput,
  CrmAiEvidenceChunkInput,
  CrmAiEvidenceSubchunkInput,
} from "@/types/admin-ai-memory";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_VERSION = "subchunk-context-v1";
const EMBEDDING_REQUEST_TIMEOUT_MS = 60_000;

function getEmbeddingApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function hashEmbeddingContent(content: string, version: string): string {
  return createHash("sha256")
    .update(version)
    .update("\u0001")
    .update(content)
    .digest("hex");
}

type EmbeddingApiPayload = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
  model?: string;
  usage?: Record<string, unknown>;
};

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

export async function generateSubchunkEmbeddings(input: {
  parentChunks: CrmAiEvidenceChunkInput[];
  subchunks: CrmAiEvidenceSubchunkInput[];
  model?: string;
  version?: string;
}): Promise<{
  rows: CrmAiEmbeddingInput[];
  model: string;
  version: string;
  usage: Record<string, unknown> | null;
}> {
  const apiKey = getEmbeddingApiKey();
  if (!apiKey) {
    throw new Error("OpenAI embeddings are not configured.");
  }

  const parentChunkById = new Map(
    input.parentChunks.map((chunk) => [
      buildStableChunkId(chunk.sourceType, chunk.sourceId),
      chunk,
    ] as const),
  );

  const prepared = input.subchunks.map((subchunk) => {
    const parentChunk = parentChunkById.get(subchunk.parentChunkId);
    if (!parentChunk) {
      throw new Error(
        `Missing parent chunk for subchunk ${subchunk.id}`,
      );
    }
    const text = buildEmbeddingContentForSubchunk({
      parentChunk,
      subchunk,
    });
    return {
      targetId: subchunk.id,
      text,
      contentHash: hashEmbeddingContent(
        text,
        input.version ?? DEFAULT_EMBEDDING_VERSION,
      ),
    };
  });

  const model = input.model ?? DEFAULT_EMBEDDING_MODEL;
  const version = input.version ?? DEFAULT_EMBEDDING_VERSION;
  const payload = await requestEmbeddings({
    apiKey,
    model,
    texts: prepared.map((item) => item.text),
  });
  const embeddings = payload.data ?? [];
  if (embeddings.length !== prepared.length) {
    throw new Error(
      `OpenAI embeddings response count mismatch: expected ${prepared.length}, got ${embeddings.length}`,
    );
  }

  return {
    rows: prepared.map((item, index) => ({
      targetType: "subchunk",
      targetId: item.targetId,
      embeddingModel: payload.model ?? model,
      embeddingVersion: version,
      contentHash: item.contentHash,
      embedding: embeddings[index]?.embedding ?? null,
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
  if (!apiKey) {
    throw new Error("OpenAI embeddings are not configured.");
  }

  const model = input.model ?? DEFAULT_EMBEDDING_MODEL;
  const version = input.version ?? "query-v1";
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
