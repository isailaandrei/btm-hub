import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminAiProvider } from "./provider";
import type {
  GlobalCohortProjection,
  AdminAiQueryPlan,
} from "@/types/admin-ai";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
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

function makeGlobalProjection(contactId: string): GlobalCohortProjection {
  return {
    contactId,
    contactName: contactId,
    memoryStatus: "fresh",
    coverage: {
      applicationCount: 1,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
    },
    facts: {
      programHistory: ["filmmaking"],
      statusHistory: ["reviewing"],
      tagNames: [],
    },
    summary: "Wildlife-focused storyteller.",
    supportRefs: [
      {
        supportRef: "support_1",
        claim: "Strong excitement about conservation storytelling.",
        confidence: "high",
      },
    ],
    contradictions: [],
    unknowns: [],
  };
}

describe("openAiAdminAiProvider.generateGlobalCohortResponse", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-5-mini";
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

  it("sends the whole cohort projections and accepts support refs as citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_999",
        model: "gpt-test",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shortlist: [
                    {
                    contactId: CONTACT_ID,
                    contactName: CONTACT_ID,
                    whyFit: ["Mission-driven fit"],
                    concerns: [],
                      citations: [
                        {
                          evidenceId: "evidence-1",
                          claimKey: "shortlist.0.whyFit.0",
                        },
                      ],
                    },
                  ],
                  contactAssessment: null,
                  uncertainty: [],
                }),
              },
            ],
          },
        ],
        usage: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = getAdminAiProvider();
    const result = await provider.generateGlobalCohortResponse({
      question: "Find mission-driven candidates",
      queryPlan: makePlan(),
      promptCacheKey: "cache-key-1",
      coverage: {
        totalCandidates: 1,
        candidatesWithoutDossierCount: 0,
        staleDossierCount: 0,
        compressionLevel: "full",
        wasCompressed: false,
      },
      cohort: [makeGlobalProjection(CONTACT_ID)],
      evidence: [
        {
          evidenceId: "evidence-1",
          contactId: CONTACT_ID,
          applicationId: null,
          sourceType: "application_answer",
          sourceId: "app-1:ultimate_vision",
          sourceLabel: "ultimate_vision",
          sourceTimestamp: "2026-04-15T00:00:00Z",
          program: "filmmaking",
          text: "I would love to work on conservation storytelling.",
        },
      ],
    });

    expect(result.response.shortlist?.[0]?.citations).toEqual([
      {
        evidenceId: "evidence-1",
        claimKey: "shortlist.0.whyFit.0",
      },
    ]);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as { input?: Array<{ role?: string; content?: string }> };
    const userMessage = body.input?.find((message) => message.role === "user");
    expect(userMessage?.content).toContain("\"supportRef\": \"support_1\"");
    expect(userMessage?.content).toContain("\"memoryStatus\": \"fresh\"");
    expect(userMessage?.content).toContain("\"compressionLevel\": \"full\"");
    expect(userMessage?.content).toContain("\"evidenceId\": \"evidence-1\"");
    expect(body).toMatchObject({
      prompt_cache_key: "cache-key-1",
    });
  });
});
