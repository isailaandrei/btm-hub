import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMapExtractionSystemPrompt,
  buildMapExtractionUserPrompt,
  chunkCards,
  MAP_CHUNK_SIZE,
  runMapScan,
} from "./map-scan";
import { mapExtractionSchema } from "./schemas";
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

  it("gates near-misses behind zero full matches and a rare criterion", () => {
    const prompt = buildMapExtractionSystemPrompt();
    expect(prompt).toContain("nearMisses");
    expect(prompt).toContain("NO contact in this batch is a full match");
    expect(prompt).toContain("missingAspect");
  });

  it("prefers near-misses matching the question's distinctive terms over topical overlap", () => {
    const prompt = buildMapExtractionSystemPrompt();
    expect(prompt).toContain("RAREST and most DISTINCTIVE terms");
    expect(prompt).toContain("generic topical overlap");
  });
});

describe("mapExtractionSchema nearMisses", () => {
  const uuid = (i: number) =>
    `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`;
  const nearMiss = (i: number) => ({
    contactId: uuid(i),
    contactName: `C${i}`,
    evidenceSummary: "partial evidence",
    missingAspect: "missing the key aspect",
  });

  it("defaults nearMisses to [] when the chunk omits them", () => {
    const parsed = mapExtractionSchema.parse({ candidates: [] });
    expect(parsed.nearMisses).toEqual([]);
  });

  it("accepts up to 3 well-formed near-misses but rejects a 4th", () => {
    expect(
      mapExtractionSchema.safeParse({
        candidates: [],
        nearMisses: [nearMiss(0), nearMiss(1), nearMiss(2)],
      }).success,
    ).toBe(true);
    expect(
      mapExtractionSchema.safeParse({
        candidates: [],
        nearMisses: [nearMiss(0), nearMiss(1), nearMiss(2), nearMiss(3)],
      }).success,
    ).toBe(false);
  });

  it("requires missingAspect on every near-miss", () => {
    expect(
      mapExtractionSchema.safeParse({
        candidates: [],
        nearMisses: [
          { contactId: uuid(0), contactName: "C0", evidenceSummary: "partial" },
        ],
      }).success,
    ).toBe(false);
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
    expect(result.nearMissIds.size).toBe(0);
    expect(result.scanMetadata.nearMissCount).toBe(0);
  });

  function nearMissJson(
    candidates: Array<{ contactId: string; contactName: string }>,
    nearMisses: Array<{ contactId: string; contactName: string }>,
  ) {
    return {
      json: {
        candidates: candidates.map((c) => ({ ...c, evidenceSummary: "quote" })),
        nearMisses: nearMisses.map((c) => ({
          ...c,
          evidenceSummary: "partial",
          missingAspect: "missing aspect",
        })),
      },
      modelMetadata: { provider: "deepseek", usage: null },
    };
  }

  it("collects near-misses ONLY from chunks with zero full matches (per-chunk gate)", async () => {
    const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      if (inChunk[0]!.contactId === cards[0]!.contactId) {
        // Chunk 0: no full match, a near-miss on its first card.
        return nearMissJson([], [inChunk[0]!]);
      }
      // Chunk 1: a full match on its first card AND a near-miss on its second —
      // the near-miss must be gated out because this chunk qualified a contact.
      return nearMissJson([inChunk[0]!], [inChunk[1]!]);
    });

    const result = await runMapScan({ provider, cards, question: "q" });

    expect([...result.candidateIds]).toEqual([cards[30]!.contactId]);
    expect([...result.nearMissIds]).toEqual([cards[0]!.contactId]);
    expect(result.scanMetadata.nearMissCount).toBe(1);
  });

  it("drops hallucinated near-miss contactIds not present in the corpus", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cards = [makeCard(0), makeCard(1)]; // single chunk, zero full matches
    const ghostId = "99999999-9999-4999-8999-999999999999";
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      return nearMissJson([], [
        inChunk[0]!,
        { contactId: ghostId, contactName: "Ghost" },
      ]);
    });

    const result = await runMapScan({ provider, cards, question: "q" });

    expect([...result.nearMissIds]).toEqual([cards[0]!.contactId]);
    expect(result.nearMissIds.has(ghostId)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("runMapScan onChunkComplete", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires once per successful chunk with that chunk's candidate count", async () => {
    // MAP_CHUNK_SIZE + 5 cards -> exactly 2 chunks.
    const cards = Array.from({ length: MAP_CHUNK_SIZE + 5 }, (_, i) =>
      makeCard(i + 1),
    );
    const provider = makeProvider(async ({ userPrompt }) => {
      const inChunk = cardsInPrompt(userPrompt);
      return completion([
        {
          contactId: inChunk[0]!.contactId,
          contactName: inChunk[0]!.contactName,
        },
      ]);
    });

    const events: Array<{ chunkIndex: number; candidateCount: number }> = [];
    await runMapScan({
      provider,
      cards,
      question: "q",
      onChunkComplete: (event) => events.push(event),
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.candidateCount)).toEqual([1, 1]);
    expect(new Set(events.map((event) => event.chunkIndex))).toEqual(
      new Set([0, 1]),
    );
  });
});
