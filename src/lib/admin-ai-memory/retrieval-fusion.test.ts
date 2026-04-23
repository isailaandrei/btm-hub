import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  listRecentAdminAiEvidence: vi.fn(),
  searchAdminAiEvidence: vi.fn(),
  searchAdminAiEvidenceByEmbedding: vi.fn(),
}));

vi.mock("./embeddings", async () => {
  const actual = await vi.importActual<typeof import("./embeddings")>(
    "./embeddings",
  );
  return {
    ...actual,
    generateQueryEmbedding: vi.fn(),
  };
});

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

function makeEvidence(
  evidenceId: string,
  contactId = CONTACT_ID,
) {
  return {
    evidenceId,
    contactId,
    applicationId: null,
    sourceType: "application_answer" as const,
    sourceId: `${evidenceId}:source`,
    sourceLabel: "ultimate_vision",
    sourceTimestamp: "2026-04-20T10:00:00Z",
    program: "filmmaking",
    text: `evidence ${evidenceId}`,
  };
}

describe("retrieveHybridEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("fuses vector and lexical hits by canonical evidence id", async () => {
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");
    const embeddingsMod = await import("./embeddings");

    vi.mocked(embeddingsMod.generateQueryEmbedding).mockResolvedValue({
      embedding: [0.1, 0.2],
      model: "text-embedding-3-small",
      version: "query-v1",
      usage: { prompt_tokens: 10 },
    });
    vi.mocked(retrievalMod.searchAdminAiEvidenceByEmbedding).mockResolvedValue([
      { evidence: makeEvidence("e2"), score: 0.91 },
      { evidence: makeEvidence("e1"), score: 0.86 },
    ]);
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([
      makeEvidence("e1"),
      makeEvidence("e3"),
    ]);

    const { retrieveHybridEvidence } = await import("./retrieval-fusion");
    const result = await retrieveHybridEvidence({
      question: "Who seems excited about ocean conservation work?",
      textFocus: ["ocean", "conservation"],
      limit: 5,
    });

    expect(result.map((item) => item.evidenceId)).toEqual(["e1", "e2", "e3"]);
  });

  it("falls back to lexical evidence when query embedding fails", async () => {
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");
    const embeddingsMod = await import("./embeddings");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(embeddingsMod.generateQueryEmbedding).mockRejectedValue(
      new Error("embedding timeout"),
    );
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([
      makeEvidence("e1"),
    ]);

    const { retrieveHybridEvidence } = await import("./retrieval-fusion");
    const result = await retrieveHybridEvidence({
      question: "Who seems excited about ocean conservation work?",
      textFocus: ["ocean", "conservation"],
      limit: 5,
    });

    expect(result.map((item) => item.evidenceId)).toEqual(["e1"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[admin-ai-memory] query embedding retrieval failed — falling back to lexical evidence only",
      expect.objectContaining({ error: "embedding timeout" }),
    );
    warnSpy.mockRestore();
  });

  it("falls back to recent evidence when both vector and lexical retrieval are empty", async () => {
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");
    const embeddingsMod = await import("./embeddings");

    vi.mocked(embeddingsMod.generateQueryEmbedding).mockResolvedValue({
      embedding: [0.1, 0.2],
      model: "text-embedding-3-small",
      version: "query-v1",
      usage: null,
    });
    vi.mocked(retrievalMod.searchAdminAiEvidenceByEmbedding).mockResolvedValue([]);
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([]);
    vi.mocked(retrievalMod.listRecentAdminAiEvidence).mockResolvedValue([
      makeEvidence("recent-1"),
    ]);

    const { retrieveHybridEvidence } = await import("./retrieval-fusion");
    const result = await retrieveHybridEvidence({
      question: "Who seems excited about ocean conservation work?",
      textFocus: ["ocean", "conservation"],
      contactId: CONTACT_ID,
      limit: 5,
    });

    expect(result.map((item) => item.evidenceId)).toEqual(["recent-1"]);
    expect(retrievalMod.listRecentAdminAiEvidence).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      limit: 5,
    });
  });
});
