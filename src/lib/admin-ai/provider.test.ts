import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminAiProvider } from "./provider";
import type { AdminAiQueryPlan } from "@/types/admin-ai";

// The payload-print path dumps raw prompts to disk; keep tests hermetic.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_OPENAI_MODEL = process.env.OPENAI_MODEL;
const ORIGINAL_PRINT_OPENAI_PAYLOAD =
  process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD;

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
    vi.unstubAllEnvs();

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

    if (ORIGINAL_PRINT_OPENAI_PAYLOAD === undefined) {
      delete process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD;
    } else {
      process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD = ORIGINAL_PRINT_OPENAI_PAYLOAD;
    }
  });

  function makeOkFetchMock(scope: "global" | "contact") {
    const payload =
      scope === "global"
        ? {
            shortlist: [
              {
                contactId: CONTACT_ID,
                contactName: "Marina Costa",
                whyFit: ["Fit"],
                concerns: [],
                citations: [
                  {
                          evidenceId: "e1",
                    claimKey: "shortlist.0.whyFit.0",
                  },
                ],
              },
            ],
            contactAssessment: null,
            uncertainty: [],
          }
        : {
            shortlist: [],
            contactAssessment: {
              inferredQualities: ["Grounded"],
              concerns: [],
              citations: [
                {
                  evidenceId: "e1",
                  claimKey: "contactAssessment.inferredQualities.0",
                },
              ],
            },
            uncertainty: [],
          };
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_model_test",
        model: "echo",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(payload) }],
          },
        ],
        usage: null,
      }),
    });
  }

  function makeGenerateInput(scope: "global" | "contact") {
    return {
      question: "Q",
      scope,
      queryPlan: makePlan(),
      cards: [
        {
          contactId: CONTACT_ID,
          contactName: "Marina Costa",
          text: "Contact: Marina Costa\n- Ultimate Vision: Ocean stories. [e1]",
          evidence: [],
        },
      ],
      evidence: [],
    };
  }

  function sentModel(fetchMock: ReturnType<typeof vi.fn>): string {
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      model?: string;
    };
    return body.model ?? "";
  }

  it("defaults synthesis to the large-context model when OPENAI_MODEL is unset", async () => {
    // The global cohort prompt is far larger than mini-tier context windows,
    // so the default must be a ~1M-context model.
    delete process.env.OPENAI_MODEL;
    const fetchMock = makeOkFetchMock("global");
    vi.stubGlobal("fetch", fetchMock);

    await getAdminAiProvider().generate(makeGenerateInput("global"));

    expect(sentModel(fetchMock)).toBe("gpt-5.4");
  });

  it("respects an OPENAI_MODEL override for synthesis", async () => {
    process.env.OPENAI_MODEL = "custom-model";
    const fetchMock = makeOkFetchMock("contact");
    vi.stubGlobal("fetch", fetchMock);

    await getAdminAiProvider().generate(makeGenerateInput("contact"));

    expect(sentModel(fetchMock)).toBe("custom-model");
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
	                          evidenceId: "e1",
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
            "- Ultimate Vision: I want to film ocean conservation stories. [e1]",
          ].join("\n"),
          evidence: [],
        },
      ],
      evidence: [
        {
          evidenceId: "e2",
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
        evidenceId: "e1",
        claimKey: "shortlist.0.whyFit.0",
      },
    ]);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as { input?: Array<{ role?: string; content?: string }> };
    const systemMessage = body.input?.find((message) => message.role === "system");
    const userMessage = body.input?.find((message) => message.role === "user");
    expect(systemMessage?.content).toContain("raw contact cards");
    expect(systemMessage?.content).toContain("square brackets");
    expect(systemMessage?.content).toContain("Structured facts");
    expect(userMessage?.content).toContain("\"rawContactCards\"");
    expect(userMessage?.content).toContain("Contact: Marina Costa");
    expect(userMessage?.content).toContain("[e1]");
    expect(userMessage?.content).toContain('"evidenceId": "e2"');
    expect(userMessage?.content).not.toContain(
      `application_answer:${APPLICATION_ID}:ultimate_vision`,
    );
    expect(body).toMatchObject({
      prompt_cache_key: "admin-ai-cards:test",
    });
  });

  it("omits evidence from the OpenAI request when evidence is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_no_evidence",
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
                      citations: [],
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
      cards: [
        {
          contactId: CONTACT_ID,
          contactName: "Marina Costa",
          text: "Contact: Marina Costa\n- Ultimate Vision: I want to film ocean conservation stories.",
          evidence: [],
        },
      ],
      evidence: [
        {
          evidenceId: "e2",
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
      includeEvidence: false,
    });

    expect(result.response.shortlist?.[0]?.citations).toEqual([]);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as {
      input?: Array<{ role?: string; content?: string }>;
      text?: { format?: { schema?: object } };
    };
    const systemMessage = body.input?.find((message) => message.role === "system");
    const userMessage = body.input?.find((message) => message.role === "user");
    const userPrompt = JSON.parse(userMessage?.content ?? "{}") as {
      evidence?: unknown;
      responseContract?: { shortlist?: Array<{ citations?: unknown[] }> };
    };

    expect(systemMessage?.content).not.toContain("square brackets");
    expect(systemMessage?.content).toContain("Return empty citation arrays");
    expect(userPrompt.evidence).toBeUndefined();
    expect(userPrompt.responseContract?.shortlist?.[0]?.citations).toEqual([]);
    expect(JSON.stringify(body.text?.format?.schema)).not.toContain(
      "\"minItems\":1",
    );
  });

  it("prints an exact token/segment/cache breakdown immediately before sending when enabled", async () => {
    process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD = "1";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = makeOkFetchMock("global");
    vi.stubGlobal("fetch", fetchMock);

    await getAdminAiProvider().generate(makeGenerateInput("global"));

    const sentBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(sentBody).toContain("\"model\":\"gpt-5-mini\"");

    const report = infoSpy.mock.calls
      .map((call) => String(call[0]))
      .find((text) => text.includes("ADMIN-AI OPENAI REQUEST"));
    expect(report).toBeDefined();
    expect(report).toContain("gpt-5-mini");
    expect(report).toContain("PROMPT-CACHE SPLIT");
    expect(report).toContain("STABLE PREFIX");
  });

  it("does not print the full OpenAI request by default, even in development", async () => {
    delete process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD;
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = makeOkFetchMock("global");
    vi.stubGlobal("fetch", fetchMock);

    await getAdminAiProvider().generate(makeGenerateInput("global"));

    expect(infoSpy).not.toHaveBeenCalled();
  });
});
