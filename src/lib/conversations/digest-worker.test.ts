import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListConversationMessagesForDigest = vi.fn();
const mockUpsertConversationDigest = vi.fn();
const mockAppendConversationFacts = vi.fn();
const mockUpsertConversationEmbeddings = vi.fn();
const mockConversationDigestExists = vi.fn();
const mockExtractConversationDigest = vi.fn();
const mockBuildConversationEmbeddingRows = vi.fn();

vi.mock("@/lib/data/conversations", () => ({
  listConversationMessagesForDigest: mockListConversationMessagesForDigest,
  upsertConversationDigest: mockUpsertConversationDigest,
  appendConversationFacts: mockAppendConversationFacts,
  upsertConversationEmbeddings: mockUpsertConversationEmbeddings,
  conversationDigestExists: mockConversationDigestExists,
}));

vi.mock("./digest-provider", () => ({
  extractConversationDigest: mockExtractConversationDigest,
}));

vi.mock("./embeddings", () => ({
  buildConversationEmbeddingRows: mockBuildConversationEmbeddingRows,
}));

describe("processConversationDigestWindows", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockListConversationMessagesForDigest.mockResolvedValue([
      {
        id: "message-1",
        contactId: "contact-1",
        body: "Budget is around $5k.",
        happenedAt: "2026-06-11T10:00:00Z",
      },
      {
        id: "message-2",
        contactId: "contact-1",
        body: "Can travel in August.",
        happenedAt: "2026-06-11T10:05:00Z",
      },
    ]);
    mockConversationDigestExists.mockResolvedValue(false);
    mockExtractConversationDigest.mockResolvedValue({
      summary: "Discussed budget and travel.",
      facts: [
        {
          fieldKey: "budget",
          valueText: "$5k",
          valueJson: null,
          confidence: "medium",
          conflictGroup: "budget",
        },
      ],
      model: "gpt-test",
    });
    mockBuildConversationEmbeddingRows.mockResolvedValue({
      rows: [
        {
          targetType: "message",
          targetId: "message-1",
          embeddingModel: "text-embedding-3-small",
          embeddingVersion: "message-v1",
          contentHash: "hash",
          embedding: [0.1],
        },
      ],
      model: "text-embedding-3-small",
      version: "message-v1",
      usage: null,
    });
  });

  it("creates digest, append-only facts, and embeddings for each contact window", async () => {
    const { processConversationDigestWindows } = await import("./digests");
    await expect(processConversationDigestWindows()).resolves.toEqual({
      processedWindows: 1,
      digestsCreated: 1,
      factsCreated: 1,
      embeddingsCreated: 1,
    });

    expect(mockUpsertConversationDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-1",
        summary: "Discussed budget and travel.",
        sourceMessageCount: 2,
      }),
    );
    expect(mockAppendConversationFacts).toHaveBeenCalledWith([
      expect.objectContaining({
        contactId: "contact-1",
        fieldKey: "budget",
        valueText: "$5k",
        conflictGroup: "budget",
      }),
    ]);
    expect(mockUpsertConversationEmbeddings).toHaveBeenCalledWith([
      expect.objectContaining({
        targetType: "message",
        targetId: "message-1",
      }),
    ]);
  });

  it("skips already-digested windows by content hash", async () => {
    mockConversationDigestExists.mockResolvedValue(true);

    const { processConversationDigestWindows } = await import("./digests");
    await expect(processConversationDigestWindows()).resolves.toEqual({
      processedWindows: 0,
      digestsCreated: 0,
      factsCreated: 0,
      embeddingsCreated: 0,
    });

    expect(mockExtractConversationDigest).not.toHaveBeenCalled();
    expect(mockAppendConversationFacts).not.toHaveBeenCalled();
    expect(mockUpsertConversationEmbeddings).not.toHaveBeenCalled();
  });
});
