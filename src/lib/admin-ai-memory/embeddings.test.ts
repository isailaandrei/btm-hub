import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_VERSION,
  generateSubchunkEmbeddings,
} from "./embeddings";
import {
  buildEvidenceSubchunks,
} from "./subchunk-builder";
import type { CrmAiEvidenceChunkInput } from "@/types/admin-ai-memory";

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeChunk(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: APP_ID,
    sourceType: "application_answer",
    logicalSourceId: `${APP_ID}:ultimate_vision`,
    sourceId: `${APP_ID}:ultimate_vision:v:hash`,
    sourceTimestamp: "2026-04-20T10:00:00Z",
    text: "I want to work on ambitious conservation storytelling projects.",
    metadata: {
      sourceLabel: "ultimate_vision",
      fieldKey: "ultimate_vision",
      fieldLabel: "Ultimate Vision",
      program: "filmmaking",
      chunkClass: "free_text_answer",
    },
    contentHash: "hash-1",
    chunkVersion: 1,
    ...overrides,
  };
}

describe("generateSubchunkEmbeddings", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
    }
  });

  it("throws when the embedding provider is not configured", async () => {
    const parentChunk = makeChunk();
    const [subchunk] = buildEvidenceSubchunks({ chunks: [parentChunk] });

    await expect(
      generateSubchunkEmbeddings({
        parentChunks: [parentChunk],
        subchunks: [subchunk],
      }),
    ).rejects.toThrow(/not configured/i);
  });

  it("calls the OpenAI embeddings API and returns persistence-ready rows", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const parentChunk = makeChunk({
      sourceType: "application_structured_field",
      logicalSourceId: `${APP_ID}:sf:budget`,
      sourceId: `${APP_ID}:sf:budget:v:hash`,
      text: "Application field: Budget. Candidate reports $2,000 - $5,000.",
      metadata: {
        sourceLabel: "Budget",
        fieldKey: "budget",
        fieldLabel: "Budget",
        normalizedValue: "$2,000 - $5,000",
        valueType: "string",
        program: "filmmaking",
        chunkClass: "structured_field",
        sensitivity: "default",
      },
    });
    const [subchunk] = buildEvidenceSubchunks({ chunks: [parentChunk] });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            embedding: [0.01, 0.02, 0.03],
            index: 0,
          },
        ],
        model: DEFAULT_EMBEDDING_MODEL,
        usage: {
          prompt_tokens: 42,
          total_tokens: 42,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateSubchunkEmbeddings({
      parentChunks: [parentChunk],
      subchunks: [subchunk],
    });

    expect(result.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(result.version).toBe(DEFAULT_EMBEDDING_VERSION);
    expect(result.rows).toEqual([
      expect.objectContaining({
        targetType: "subchunk",
        targetId: subchunk.id,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        embeddingVersion: DEFAULT_EMBEDDING_VERSION,
        embedding: [0.01, 0.02, 0.03],
      }),
    ]);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as { input?: string[]; model?: string };
    expect(body.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(body.input?.[0]).toContain("Source type: application_structured_field");
    expect(body.input?.[0]).toContain("Field key: budget");
    expect(body.input?.[0]).toContain("Content: Application field: Budget.");
  });
});
