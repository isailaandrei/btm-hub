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
    // The new noise-aware contract reaches the model.
    expect(requestBody.input[0].content).toContain("SIGNAL (extract)");
    expect(requestBody.input[0].content).toContain("NOISE (ignore)");
    expect(requestBody.input[0].content).toContain("in ENGLISH");
    expect(result).toEqual({
      summary: "Discussed budget.",
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
    expect(callArg.systemPrompt).toContain("SIGNAL (extract)");
    expect(callArg.systemPrompt).toContain("NOISE (ignore)");
    expect(callArg.systemPrompt).toContain("in ENGLISH");
    expect(callArg.userPrompt).toBe("message-1: Confirmed for March.");
    expect(result).toEqual({
      summary: "Confirmed for the March trip.",
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

    expect(result).toEqual({ summary: "", facts: [], model: "deepseek-v4-pro" });
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
