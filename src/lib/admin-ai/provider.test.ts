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
    process.env.OPENAI_MODEL = "gpt-5.4-nano";
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

  it("rejects shortlist ids that are outside the ranking cohort", async () => {
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
                    shortlistedContactIds: [OTHER_CONTACT_ID],
                    reasons: [
                      {
                        contactId: OTHER_CONTACT_ID,
                        reason: "Strong fit",
                      },
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

    await expect(
      provider.generateRanking({
        question: "Find the strongest applicants",
        queryPlan: makePlan(),
        rankingCards: [makeRankingCard(CONTACT_ID)],
        candidatesMissingMemory: [],
      }),
    ).rejects.toThrow(/not in cohort/i);
  });
});
