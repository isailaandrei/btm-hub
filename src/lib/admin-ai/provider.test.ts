import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminAiProvider } from "./provider";
import type { AdminAiQueryPlan } from "@/types/admin-ai";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
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

describe("openAiAdminAiProvider.generate", () => {
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

  it("sends raw contact cards, supplied evidence ids, and prompt cache metadata", async () => {
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
                      contactName: "Marina Costa",
                      whyFit: ["Mission-driven fit"],
                      concerns: [],
                      citations: [
                        {
                          evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
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
    const result = await provider.generate({
      question: "Find mission-driven candidates",
      scope: "global",
      queryPlan: makePlan(),
      promptCacheKey: "admin-ai-cards:test",
      cards: [
        {
          contactId: CONTACT_ID,
          contactName: "Marina Costa",
          text: [
            "Contact: Marina Costa",
            `- Ultimate Vision: I want to film ocean conservation stories. [application_answer:${APPLICATION_ID}:ultimate_vision]`,
          ].join("\n"),
          evidence: [],
        },
      ],
      evidence: [
        {
          evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
          contactId: CONTACT_ID,
          applicationId: APPLICATION_ID,
          sourceType: "application_answer",
          sourceId: `${APPLICATION_ID}:ultimate_vision`,
          sourceLabel: "Ultimate Vision",
          sourceTimestamp: "2026-04-15T00:00:00Z",
          program: "filmmaking",
          text: "I want to film ocean conservation stories.",
        },
      ],
    });

    expect(result.response.shortlist?.[0]?.citations).toEqual([
      {
        evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
        claimKey: "shortlist.0.whyFit.0",
      },
    ]);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as { input?: Array<{ role?: string; content?: string }> };
    const systemMessage = body.input?.find((message) => message.role === "system");
    const userMessage = body.input?.find((message) => message.role === "user");
    expect(systemMessage?.content).toContain("raw contact cards");
    expect(userMessage?.content).toContain("\"rawContactCards\"");
    expect(userMessage?.content).toContain("Contact: Marina Costa");
    expect(userMessage?.content).toContain(
      `application_answer:${APPLICATION_ID}:ultimate_vision`,
    );
    expect(body).toMatchObject({
      prompt_cache_key: "admin-ai-cards:test",
    });
  });
});
