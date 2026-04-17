import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminAiRankingProvider } from "./provider";
import type { AdminAiQueryPlan } from "@/types/admin-ai";
import type { CrmAiContactRankingCard } from "@/types/admin-ai-memory";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_OPENAI_MODEL = process.env.OPENAI_MODEL;

function makePlan(): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
  };
}

function makeRankingCard(contactId: string): CrmAiContactRankingCard {
  return {
    contact_id: contactId,
    dossier_version: 2,
    source_fingerprint: "fp",
    facts_json: {},
    top_fit_signals_json: [],
    top_concerns_json: [],
    confidence_notes_json: [],
    short_summary: "summary",
    updated_at: "2026-04-16T00:00:00Z",
  };
}

describe("openAiAdminAiRankingProvider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (ORIGINAL_OPENAI_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
    }

    if (ORIGINAL_OPENAI_MODEL === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = ORIGINAL_OPENAI_MODEL;
    }
  });

  it("drops foreign contactIds from the shortlist with a warning instead of throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "resp_123",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    shortlistedContactIds: [CONTACT_ID, OTHER_CONTACT_ID],
                    reasons: [
                      { contactId: CONTACT_ID, reason: "In cohort" },
                      { contactId: OTHER_CONTACT_ID, reason: "Not in cohort" },
                    ],
                    cohortNotes: null,
                  }),
                },
              ],
            },
          ],
          usage: null,
        }),
      }),
    );

    const provider = getAdminAiRankingProvider();
    const result = await provider.generateRanking({
      question: "Find the strongest applicants",
      queryPlan: makePlan(),
      rankingCards: [makeRankingCard(CONTACT_ID)],
      candidatesMissingMemory: [],
    });

    expect(result.shortlistedContactIds).toEqual([CONTACT_ID]);
    expect(result.reasons).toEqual([
      { contactId: CONTACT_ID, reason: "In cohort" },
    ]);
    expect(result.droppedContactIds).toEqual([OTHER_CONTACT_ID]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not in cohort"),
      expect.objectContaining({ droppedIds: [OTHER_CONTACT_ID] }),
    );
  });

  it("returns an empty shortlist (not a throw) when every returned id is foreign", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "resp_456",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    shortlistedContactIds: [OTHER_CONTACT_ID],
                    reasons: [
                      { contactId: OTHER_CONTACT_ID, reason: "Invented" },
                    ],
                    cohortNotes: "cohort coverage weak",
                  }),
                },
              ],
            },
          ],
          usage: null,
        }),
      }),
    );

    const provider = getAdminAiRankingProvider();
    const result = await provider.generateRanking({
      question: "Find candidates",
      queryPlan: makePlan(),
      rankingCards: [makeRankingCard(CONTACT_ID)],
      candidatesMissingMemory: [],
    });

    expect(result.shortlistedContactIds).toEqual([]);
    expect(result.reasons).toEqual([]);
    expect(result.droppedContactIds).toEqual([OTHER_CONTACT_ID]);
    expect(result.cohortNotes).toBe("cohort coverage weak");
  });

  it("surfaces candidate coverage as a count (not a UUID list) in the user prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_789",
        model: "gpt-test",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shortlistedContactIds: [CONTACT_ID],
                  reasons: [{ contactId: CONTACT_ID, reason: "fit" }],
                  cohortNotes: null,
                }),
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = getAdminAiRankingProvider();
    await provider.generateRanking({
      question: "q",
      queryPlan: makePlan(),
      rankingCards: [makeRankingCard(CONTACT_ID)],
      candidatesMissingMemory: [OTHER_CONTACT_ID, "another-uuid"],
    });

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as { input?: Array<{ role?: string; content?: string }> };
    const userMessage = body.input?.find((m) => m.role === "user");
    expect(userMessage?.content).toBeDefined();
    expect(userMessage?.content).toContain("candidatesWithoutMemoryCount");
    // The UUID list must NOT appear in the prompt.
    expect(userMessage?.content).not.toContain(OTHER_CONTACT_ID);
    expect(userMessage?.content).not.toContain("another-uuid");
  });
});
