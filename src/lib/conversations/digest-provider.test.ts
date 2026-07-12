import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAdminAiProvider = vi.fn();

vi.mock("@/lib/admin-ai/provider", () => ({
  getAdminAiProvider: mockGetAdminAiProvider,
}));

// A provider double with no completeJson forces the OpenAI Responses fallback.
function openAiStyleProvider() {
  return {
    isConfigured: () => true,
    getUnavailableReason: () => null,
    generate: vi.fn(),
  };
}

describe("extractConversationDigest", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    mockGetAdminAiProvider.mockReturnValue(openAiStyleProvider());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("uses the OpenAI Responses json_schema path when the provider has no completeJson", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "resp-1",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    summary: "Discussed budget.",
                    relevance: "profile",
                    facts: [
                      {
                        fieldKey: "budget",
                        valueText: "$5k",
                        valueJson: null,
                        confidence: "medium",
                        conflictGroup: "budget",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { extractConversationDigest } = await import("./digest-provider");
    const result = await extractConversationDigest({
      transcript: "message-1: Budget is around $5k.",
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(
      requestBody.text.format.schema.properties.facts.items.properties.valueJson,
    ).toEqual({ type: "null" });
    // The profile/status/noise contract reaches the model.
    expect(requestBody.input[0].content).toContain("PROFILE —");
    expect(requestBody.input[0].content).toContain("STATUS —");
    expect(requestBody.input[0].content).toContain(
      "CALL/MEETING SCHEDULING IS ALWAYS NOISE",
    );
    expect(requestBody.input[0].content).toContain("ONLY for PROFILE-grade");
    expect(requestBody.input[0].content).toContain("in ENGLISH");
    // The strict schema requires relevance AND event_date.
    expect(requestBody.text.format.schema.required).toContain("relevance");
    expect(requestBody.text.format.schema.required).toContain("event_date");
    expect(requestBody.text.format.schema.properties.event_date).toBeDefined();
    // The event-date and apparel-size rules reach the model.
    expect(requestBody.input[0].content).toContain("event_date");
    expect(requestBody.input[0].content).toContain("apparel_sizes");
    expect(result).toEqual({
      summary: "Discussed budget.",
      relevance: "profile",
      eventDate: null,
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
  });

  it("uses the DeepSeek completeJson path when available, without any fetch", async () => {
    const completeJson = vi.fn().mockResolvedValue({
      json: {
        summary: "Confirmed for the March trip.",
        relevance: "profile",
        facts: [
          {
            fieldKey: "start_timeline",
            valueText: "March",
            valueJson: null,
            confidence: "high",
            conflictGroup: null,
          },
        ],
      },
      modelMetadata: { model: "deepseek-v4-pro" },
    });
    mockGetAdminAiProvider.mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
      completeJson,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { extractConversationDigest } = await import("./digest-provider");
    const result = await extractConversationDigest({
      transcript: "message-1: Confirmed for March.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const callArg = completeJson.mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
    };
    expect(callArg.systemPrompt).toContain("PROFILE —");
    expect(callArg.systemPrompt).toContain("STATUS —");
    expect(callArg.systemPrompt).toContain(
      "CALL/MEETING SCHEDULING IS ALWAYS NOISE",
    );
    expect(callArg.systemPrompt).toContain("in ENGLISH");
    expect(callArg.userPrompt).toBe("message-1: Confirmed for March.");
    expect(result).toEqual({
      summary: "Confirmed for the March trip.",
      relevance: "profile",
      eventDate: null,
      facts: [
        {
          fieldKey: "start_timeline",
          valueText: "March",
          valueJson: null,
          confidence: "high",
          conflictGroup: null,
        },
      ],
      model: "deepseek-v4-pro",
    });
  });

  it("carries a valid model event_date through the DeepSeek path", async () => {
    mockGetAdminAiProvider.mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        json: {
          summary: "Arrives for the Azores trip on the 17th.",
          relevance: "status",
          event_date: "2026-08-17",
          facts: [],
        },
        modelMetadata: { model: "deepseek-v4-pro" },
      }),
    });

    const { extractConversationDigest } = await import("./digest-provider");
    const result = await extractConversationDigest({ transcript: "x" });
    expect(result.eventDate).toBe("2026-08-17");
  });

  it("clamps an absurd future event_date to null (fail-safe)", async () => {
    mockGetAdminAiProvider.mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        json: {
          summary: "Vague future plans.",
          relevance: "status",
          event_date: "2099-01-01",
          facts: [],
        },
        modelMetadata: { model: "deepseek-v4-pro" },
      }),
    });

    const { extractConversationDigest } = await import("./digest-provider");
    const result = await extractConversationDigest({ transcript: "x" });
    expect(result.eventDate).toBeNull();
  });

  it("passes an empty-summary DeepSeek result straight through (noise handled downstream)", async () => {
    mockGetAdminAiProvider.mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        json: { summary: "", facts: [] },
        modelMetadata: { model: "deepseek-v4-pro" },
      }),
    });

    const { extractConversationDigest } = await import("./digest-provider");
    const result = await extractConversationDigest({ transcript: "hi there" });

    expect(result).toEqual({
      summary: "",
      relevance: null,
      eventDate: null,
      facts: [],
      model: "deepseek-v4-pro",
    });
  });

  it("fails loud when the DeepSeek JSON violates the digest schema", async () => {
    mockGetAdminAiProvider.mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
      completeJson: vi.fn().mockResolvedValue({
        json: { facts: [] }, // missing summary
        modelMetadata: { model: "deepseek-v4-pro" },
      }),
    });

    const { extractConversationDigest } = await import("./digest-provider");
    await expect(
      extractConversationDigest({ transcript: "x" }),
    ).rejects.toThrow(/failed schema validation/);
  });
});

describe("clampEventDate", () => {
  const NOW = Date.parse("2026-07-12T00:00:00.000Z");

  it("passes a valid near-future date unchanged", async () => {
    const { clampEventDate } = await import("./digest-provider");
    expect(clampEventDate("2026-08-17", NOW)).toBe("2026-08-17");
  });

  it("passes a past date (it simply doesn't extend visibility)", async () => {
    const { clampEventDate } = await import("./digest-provider");
    expect(clampEventDate("2026-01-01", NOW)).toBe("2026-01-01");
  });

  it("nulls a non-date / malformed string", async () => {
    const { clampEventDate } = await import("./digest-provider");
    expect(clampEventDate("next August", NOW)).toBeNull();
    expect(clampEventDate("2026/08/17", NOW)).toBeNull();
    expect(clampEventDate("", NOW)).toBeNull();
    expect(clampEventDate(null, NOW)).toBeNull();
    expect(clampEventDate(undefined, NOW)).toBeNull();
  });

  it("nulls an overflow calendar date that JS would roll forward", async () => {
    const { clampEventDate } = await import("./digest-provider");
    expect(clampEventDate("2026-02-30", NOW)).toBeNull();
    expect(clampEventDate("2026-13-01", NOW)).toBeNull();
  });

  it("nulls a date more than 18 months in the future", async () => {
    const { clampEventDate } = await import("./digest-provider");
    // ~19 months out.
    expect(clampEventDate("2028-03-01", NOW)).toBeNull();
  });
});
