import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateQueryEmbedding = vi.fn();
const mockHasConversationMessages = vi.fn();
const mockSearchConversationEmbeddings = vi.fn();
const mockSearchConversationMessagesFts = vi.fn();

vi.mock("./embeddings", () => ({
  generateQueryEmbedding: mockGenerateQueryEmbedding,
}));

vi.mock("@/lib/data/conversations", () => ({
  hasConversationMessages: mockHasConversationMessages,
  searchConversationEmbeddings: mockSearchConversationEmbeddings,
  searchConversationMessagesFts: mockSearchConversationMessagesFts,
}));

describe("retrieveConversationEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockHasConversationMessages.mockResolvedValue(true);
  });

  it("returns no evidence without calling OpenAI when no conversation messages exist", async () => {
    mockHasConversationMessages.mockResolvedValue(false);

    const { retrieveConversationEvidence } = await import("./retrieval");
    await expect(
      retrieveConversationEvidence({
        question: "budget",
        contactId: null,
      }),
    ).resolves.toEqual([]);

    expect(mockGenerateQueryEmbedding).not.toHaveBeenCalled();
    expect(mockSearchConversationEmbeddings).not.toHaveBeenCalled();
    expect(mockSearchConversationMessagesFts).not.toHaveBeenCalled();
  });

  it("combines vector and FTS message evidence with stable whatsapp anchors", async () => {
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.1, 0.2],
      model: "text-embedding-3-small",
      version: "query-v1",
      usage: null,
    });
    mockSearchConversationEmbeddings.mockResolvedValue([
      {
        messageId: "message-1",
        contactId: "contact-1",
        body: "Budget is around $5k.",
        happenedAt: "2026-06-11T10:00:00Z",
        score: 0.9,
      },
    ]);
    mockSearchConversationMessagesFts.mockResolvedValue([
      {
        messageId: "message-1",
        contactId: "contact-1",
        body: "Budget is around $5k.",
        happenedAt: "2026-06-11T10:00:00Z",
        score: 0.5,
      },
      {
        messageId: "message-2",
        contactId: "contact-1",
        body: "Can travel in August.",
        happenedAt: "2026-06-11T10:10:00Z",
        score: 0.4,
      },
    ]);

    const { retrieveConversationEvidence } = await import("./retrieval");
    const evidence = await retrieveConversationEvidence({
      question: "budget and travel",
      contactId: "contact-1",
      limit: 10,
    });

    expect(mockSearchConversationEmbeddings).toHaveBeenCalledWith({
      embedding: [0.1, 0.2],
      contactId: "contact-1",
      limit: 10,
    });
    expect(mockSearchConversationMessagesFts).toHaveBeenCalledWith({
      query: "budget and travel",
      contactId: "contact-1",
      limit: 10,
    });
    expect(evidence).toEqual([
      {
        evidenceId: "whatsapp_message:message-1",
        contactId: "contact-1",
        applicationId: null,
        sourceType: "whatsapp_message",
        sourceId: "message-1",
        sourceLabel: "WhatsApp message",
        sourceTimestamp: "2026-06-11T10:00:00Z",
        program: null,
        text: "Budget is around $5k.",
      },
      expect.objectContaining({
        evidenceId: "whatsapp_message:message-2",
      }),
    ]);
  });

  it("uses reciprocal-rank fusion instead of raw score dominance", async () => {
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.1],
      model: "text-embedding-3-small",
      version: "query-v1",
      usage: null,
    });
    mockSearchConversationEmbeddings.mockResolvedValue([
      {
        messageId: "vector-top",
        contactId: "contact-1",
        body: "Vector top",
        happenedAt: "2026-06-11T10:00:00Z",
        score: 0.9,
      },
      {
        messageId: "both-mid",
        contactId: "contact-1",
        body: "Appears in both lists",
        happenedAt: "2026-06-11T10:01:00Z",
        score: 0.8,
      },
    ]);
    mockSearchConversationMessagesFts.mockResolvedValue([
      {
        messageId: "fts-top-high-raw-score",
        contactId: "contact-1",
        body: "FTS top",
        happenedAt: "2026-06-11T10:02:00Z",
        score: 100,
      },
      {
        messageId: "both-mid",
        contactId: "contact-1",
        body: "Appears in both lists",
        happenedAt: "2026-06-11T10:01:00Z",
        score: 1,
      },
    ]);

    const { retrieveConversationEvidence } = await import("./retrieval");
    const evidence = await retrieveConversationEvidence({
      question: "budget",
      contactId: "contact-1",
      limit: 3,
    });

    expect(evidence.map((item) => item.sourceId)[0]).toBe("both-mid");
  });
});
