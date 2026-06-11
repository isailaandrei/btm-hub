import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildConversationEmbeddingRows,
  generateQueryEmbedding,
  hashEmbeddingContent,
} from "./embeddings";

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

describe("conversation embeddings", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
  });

  it("hashes embedding content with the embedding version", () => {
    expect(hashEmbeddingContent("hello", "v1")).toBe(hashEmbeddingContent("hello", "v1"));
    expect(hashEmbeddingContent("hello", "v1")).not.toBe(
      hashEmbeddingContent("hello", "v2"),
    );
  });

  it("builds message embedding rows from OpenAI embeddings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "text-embedding-3-small",
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 10 },
        }),
      }),
    );

    const result = await buildConversationEmbeddingRows({
      messages: [
        {
          id: "message-1",
          body: "Can afford around $5k.",
        },
      ],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        targetType: "message",
        targetId: "message-1",
        embeddingModel: "text-embedding-3-small",
        embeddingVersion: "message-v1",
        embedding: [0.1, 0.2, 0.3],
      }),
    ]);
  });

  it("generates query embeddings for retrieval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "text-embedding-3-small",
          data: [{ index: 0, embedding: [0.4, 0.5] }],
          usage: null,
        }),
      }),
    );

    await expect(generateQueryEmbedding({ text: "budget" })).resolves.toEqual({
      embedding: [0.4, 0.5],
      model: "text-embedding-3-small",
      version: "query-v1",
      usage: null,
    });
  });
});
