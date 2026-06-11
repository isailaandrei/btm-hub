import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("extractConversationDigest", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("requests strict structured output with valueJson constrained to null", async () => {
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
});
