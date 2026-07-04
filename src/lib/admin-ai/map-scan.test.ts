import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMapExtractionSystemPrompt,
  buildMapExtractionUserPrompt,
  chunkCards,
  MAP_CHUNK_SIZE,
  runMapScan,
} from "./map-scan";
import type { RenderedContactCard } from "./contact-card";
import type { AdminAiProvider } from "./provider";

function makeCard(n: number): RenderedContactCard {
  const id = `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
  return {
    contactId: id,
    contactName: `Contact ${n}`,
    text: `Contact ${n}\n- Ultimate Vision: story ${n}.`,
    evidence: [],
  };
}

type CompleteJson = NonNullable<AdminAiProvider["completeJson"]>;

function makeProvider(completeJson?: CompleteJson): AdminAiProvider {
  return {
    isConfigured: () => true,
    getUnavailableReason: () => null,
    getModel: () => "deepseek-v4-pro",
    generate: vi.fn() as unknown as AdminAiProvider["generate"],
    completeJson,
  };
}

function cardsInPrompt(
  userPrompt: string,
): Array<{ contactId: string; contactName: string }> {
  const parsed = JSON.parse(userPrompt) as {
    rawContactCards: Array<{ contactId: string; contactName: string }>;
  };
  return parsed.rawContactCards;
}

function completion(
  candidates: Array<{ contactId: string; contactName: string }>,
  usage: Record<string, unknown> | null = null,
) {
  return {
    json: {
      candidates: candidates.map((c) => ({ ...c, evidenceSummary: "quote" })),
    },
    modelMetadata: {
      provider: "deepseek",
      responseId: "id",
      model: "deepseek-v4-pro",
      usage,
    },
  };
}

describe("chunkCards", () => {
  it("slices in stable index order with a short tail", () => {
    const items = Array.from({ length: 65 }, (_, i) => i);
    const chunks = chunkCards(items, MAP_CHUNK_SIZE);
    expect(chunks.map((c) => c.length)).toEqual([30, 30, 5]);
    expect(chunks.flat()).toEqual(items);
  });

  it("throws on a non-positive size (guards the infinite loop)", () => {
    expect(() => chunkCards([1, 2], 0)).toThrow();
  });
});

describe("buildMapExtractionSystemPrompt", () => {
  it("requires a specific, quotable statement and rejects vague interest", () => {
    const prompt = buildMapExtractionSystemPrompt();
    expect(prompt).toContain("SPECIFIC, QUOTABLE statement");
    expect(prompt).toContain("named project");
    expect(prompt).toContain("defined concept");
    expect(prompt).toContain("Do NOT flag general enthusiasm");
    expect(prompt).toContain("quoted verbatim");
  });
});

describe("buildMapExtractionUserPrompt", () => {
  it("puts cards first and question last", () => {
    const prompt = buildMapExtractionUserPrompt({
      cards: [makeCard(0)],
      question: "who freedives?",
    });
    expect(prompt.indexOf('"rawContactCards"')).toBeLessThan(
      prompt.indexOf('"question"'),
    );
    expect(prompt).toContain('"card"');
    expect(prompt).not.toContain('"text"');
  });
});

describe("runMapScan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when the provider does not support completeJson", async () => {
    await expect(
      runMapScan({
        provider: makeProvider(undefined),
        cards: [makeCard(0)],
        question: "q",
      }),
    ).rejects.toThrow(/completeJson/);
  });

  it("extracts candidates, sums usage, and reports scan metadata", async () => {
    const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      // Flag the first card of each chunk.
      return completion([inChunk[0]!], {
        prompt_cache_hit_tokens: 10,
        prompt_cache_miss_tokens: 5,
        completion_tokens: 3,
      });
    });

    const result = await runMapScan({ provider, cards, question: "q" });

    expect([...result.candidateIds]).toEqual([
      cards[0]!.contactId,
      cards[30]!.contactId,
    ]);
    expect(result.scanMetadata).toMatchObject({
      mode: "map_reduce",
      chunkCount: 2,
      chunkSize: 30,
      candidateCount: 2,
      retriedChunkCount: 0,
      usage: {
        prompt_cache_hit_tokens: 20,
        prompt_cache_miss_tokens: 10,
        completion_tokens: 6,
      },
    });
  });

  it("automatically retries a failed chunk once (wave 2) and succeeds", async () => {
    const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
    const failedOnce = new Set<string>();
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      const key = inChunk[0]!.contactId;
      // The second chunk fails its first attempt, then succeeds on retry.
      if (key === cards[30]!.contactId && !failedOnce.has(key)) {
        failedOnce.add(key);
        throw new Error("transient chunk failure");
      }
      return completion([inChunk[0]!]);
    });

    const result = await runMapScan({ provider, cards, question: "q" });

    expect(result.scanMetadata.retriedChunkCount).toBe(1);
    expect(result.candidateIds.size).toBe(2);
  });

  it("throws naming the chunk index when a chunk fails both waves", async () => {
    const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      // Chunk index 1 (cards[30..]) fails on every attempt.
      if (inChunk[0]!.contactId === cards[30]!.contactId) {
        throw new Error("permanent chunk failure");
      }
      return completion([inChunk[0]!]);
    });

    await expect(
      runMapScan({ provider, cards, question: "q" }),
    ).rejects.toThrow(/chunk\(s\) 1/);
  });

  it("treats a Zod-invalid chunk result as a failure", async () => {
    const cards = [makeCard(0)];
    const provider = makeProvider(async () => ({
      json: { candidates: [{ contactId: "not-a-uuid", contactName: "X" }] },
      modelMetadata: { provider: "deepseek", usage: null },
    }));

    await expect(
      runMapScan({ provider, cards, question: "q" }),
    ).rejects.toThrow(/chunk\(s\) 0/);
  });

  it("drops hallucinated contactIds not present in the corpus, with a warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cards = [makeCard(0), makeCard(1)];
    const ghostId = "99999999-9999-4999-8999-999999999999";
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      return completion([
        inChunk[0]!,
        { contactId: ghostId, contactName: "Ghost" },
      ]);
    });

    const result = await runMapScan({ provider, cards, question: "q" });

    expect([...result.candidateIds]).toEqual([cards[0]!.contactId]);
    expect(result.candidateIds.has(ghostId)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("dedupes the same contactId flagged by more than one chunk", async () => {
    const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
    // Every chunk flags corpus card 0 (a valid id), so both chunks return it.
    const provider = makeProvider(async () => completion([cards[0]!]));

    const result = await runMapScan({ provider, cards, question: "q" });

    expect([...result.candidateIds]).toEqual([cards[0]!.contactId]);
  });

  it("returns an empty candidate set when no chunk finds anything", async () => {
    const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
    const provider = makeProvider(async () => completion([]));

    const result = await runMapScan({ provider, cards, question: "q" });

    expect(result.candidateIds.size).toBe(0);
    expect(result.scanMetadata.candidateCount).toBe(0);
  });
});
