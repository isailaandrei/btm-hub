import { describe, it, expect, vi, beforeEach } from "vitest";
import { DOSSIER_RESPONSE_JSON_SCHEMA, dossierResultSchema } from "./dossier-schema";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const CHUNK_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHUNK_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROMPT_CHUNK_ID_A = "chunk_1";
const PROMPT_CHUNK_ID_B = "chunk_2";

function makeRawDossier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    signals: {
      motivation: [
        { value: "Passionate about ocean conservation", confidence: "high" },
      ],
      communicationStyle: [],
      reliabilitySignals: [],
      fitSignals: [
        { value: "Strong filmmaking experience", confidence: "medium" },
      ],
      concerns: [
        { value: "Limited diving certification", confidence: "medium" },
      ],
    },
    contradictions: [],
    unknowns: ["No info on availability for Q3 trip"],
    evidenceAnchors: [
      {
        claim: "Passionate about ocean conservation",
        chunkIds: [PROMPT_CHUNK_ID_A],
        confidence: "high",
      },
    ],
    summary: {
      short: "Passionate ocean storyteller, mid-experience diver.",
      medium:
        "Joana brings strong filmmaking skills and a clear conservation mission, but is early in her diving certification journey.",
    },
    ...overrides,
  };
}

function makeContactFacts(): Record<string, unknown> {
  return {
    contact: {
      contactId: CONTACT_ID,
      contactName: "Joana",
      contactEmail: "joana@example.com",
      contactPhone: null,
    },
    applications: {
      applicationCount: 1,
      applicationIds: ["app-1"],
      programHistory: ["Filmmaking"],
      statusHistory: ["Accepted"],
    },
    tags: {
      tagIds: ["tag-1"],
      tagNames: ["Ocean"],
      observedTagIds: ["tag-1"],
      observedTagNames: ["Ocean"],
    },
    structuredFieldDetails: {
      budget: {
        fieldLabel: "Budget",
        valueType: "string",
        rawValues: ["Small budget"],
        normalizedValues: ["Small budget"],
      },
    },
    observationSummary: {
      fieldHistory: {},
      conflictingFields: [],
      tagHistory: [],
    },
  };
}

describe("dossierResultSchema", () => {
  it("accepts a well-formed dossier", () => {
    const parsed = dossierResultSchema.parse(makeRawDossier());
    expect(parsed.summary.short).toBeTypeOf("string");
    expect(parsed.signals.fitSignals).toHaveLength(1);
    expect(parsed).not.toHaveProperty("facts");
  });

  it("does not require model-authored facts in the provider JSON schema", () => {
    expect(DOSSIER_RESPONSE_JSON_SCHEMA.required).not.toContain("facts");
  });

  it("rejects dossiers that omit required sections", () => {
    const broken = { ...makeRawDossier() } as Record<string, unknown>;
    delete broken.signals;
    expect(() => dossierResultSchema.parse(broken)).toThrow();
  });

  it("rejects dossiers whose summary is the only signal carrier", () => {
    const broken = makeRawDossier({
      signals: {
        motivation: [],
        communicationStyle: [],
        reliabilitySignals: [],
        fitSignals: [],
        concerns: [],
      },
      contradictions: [],
      unknowns: [],
      evidenceAnchors: [],
    });
    expect(() => dossierResultSchema.parse(broken)).toThrow(
      /signal|anchor|unknown/i,
    );
  });
});

describe("generateContactDossier", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_DOSSIER_MODEL;
    delete process.env.OPENAI_MODEL;
  });

  it("throws when the dossier provider is not configured", async () => {
    const { generateContactDossier } = await import("./dossier-generator");
    await expect(
      generateContactDossier({
        contactId: CONTACT_ID,
        contactFacts: makeContactFacts(),
        chunks: [
          {
            chunkId: CHUNK_ID_A,
            sourceType: "application_answer",
            sourceLabel: "ultimate_vision",
            sourceTimestamp: "2026-04-15T00:00:00Z",
            text: "I want to be the voice of the ocean.",
          },
        ],
      }),
    ).rejects.toThrow(/not configured/i);
  });

  it("calls the OpenAI provider once and validates the response", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp-1",
        model: "gpt-test",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(
                  makeRawDossier({
                    evidenceAnchors: [
                      {
                        claim: "Passionate about ocean conservation",
                        chunkIds: [PROMPT_CHUNK_ID_A],
                        confidence: "high",
                      },
                    ],
                  }),
                ),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateContactDossier } = await import("./dossier-generator");
    const result = await generateContactDossier({
      contactId: CONTACT_ID,
      contactFacts: makeContactFacts(),
      chunks: [
        {
          chunkId: CHUNK_ID_A,
          sourceType: "application_answer",
          sourceLabel: "ultimate_vision",
          sourceTimestamp: "2026-04-15T00:00:00Z",
          text: "I want to be the voice of the ocean.",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.dossier.summary.short).toContain("Passionate");
    expect(result.modelMetadata.model).toBe("gpt-test");
    expect(result.dossier.evidenceAnchors[0]?.chunkIds).toEqual([CHUNK_ID_A]);

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as {
      input?: Array<{ role?: string; content?: string }>;
    };
    const userMessage = requestBody.input?.find((item) => item.role === "user");
    expect(userMessage?.content).toContain(PROMPT_CHUNK_ID_A);
    expect(userMessage?.content).not.toContain(CHUNK_ID_A);
  });

  it("rejects dossiers whose evidence anchors point to unknown chunk ids", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";
    const raw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Has reef monitoring experience",
          chunkIds: ["chunk_99"],
          confidence: "medium",
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp-2",
        model: "gpt-test",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify(raw) },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateContactDossier } = await import("./dossier-generator");
    await expect(
      generateContactDossier({
        contactId: CONTACT_ID,
        contactFacts: makeContactFacts(),
        chunks: [
          {
            chunkId: CHUNK_ID_A,
            sourceType: "application_answer",
            sourceLabel: "ultimate_vision",
            sourceTimestamp: null,
            text: "I want to be the voice of the ocean.",
          },
          {
            chunkId: CHUNK_ID_B,
            sourceType: "contact_note",
            sourceLabel: "Contact note (Andrei)",
            sourceTimestamp: null,
            text: "Met at the dock.",
          },
        ],
      }),
    ).rejects.toThrow(/unknown chunk/i);
  });

  it("maps multiple prompt-local chunk ids back to stable chunk ids", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";
    const raw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Has both motivation and context",
          chunkIds: [PROMPT_CHUNK_ID_A, PROMPT_CHUNK_ID_B],
          confidence: "medium",
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp-3",
        model: "gpt-test",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify(raw) },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateContactDossier } = await import("./dossier-generator");
    const result = await generateContactDossier({
      contactId: CONTACT_ID,
      contactFacts: makeContactFacts(),
      chunks: [
        {
          chunkId: CHUNK_ID_A,
          sourceType: "application_answer",
          sourceLabel: "ultimate_vision",
          sourceTimestamp: null,
          text: "I want to be the voice of the ocean.",
        },
        {
          chunkId: CHUNK_ID_B,
          sourceType: "contact_note",
          sourceLabel: "Contact note (Andrei)",
          sourceTimestamp: null,
          text: "Met at the dock.",
        },
      ],
    });

    expect(result.dossier.evidenceAnchors[0]?.chunkIds).toEqual([
      CHUNK_ID_A,
      CHUNK_ID_B,
    ]);
  });

  it("retries once with a repair prompt when the model returns a malformed chunk label", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";

    const invalidRaw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Still references something",
          chunkIds: ["chunk_"],
          confidence: "medium",
        },
      ],
    });
    const validRaw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Fixed after repair",
          chunkIds: [PROMPT_CHUNK_ID_A],
          confidence: "high",
        },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "resp-bad",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(invalidRaw) }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "resp-good",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(validRaw) }],
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { generateContactDossier } = await import("./dossier-generator");
    const result = await generateContactDossier({
      contactId: CONTACT_ID,
      contactFacts: makeContactFacts(),
      chunks: [
        {
          chunkId: CHUNK_ID_A,
          sourceType: "application_answer",
          sourceLabel: "ultimate_vision",
          sourceTimestamp: null,
          text: "I want to be the voice of the ocean.",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.dossier.evidenceAnchors[0]?.chunkIds).toEqual([CHUNK_ID_A]);
    expect(result.modelMetadata.repairAttempted).toBe(true);

    const repairBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}"),
    ) as { input?: Array<{ role?: string; content?: string }> };
    const repairSystem = repairBody.input?.find(
      (item) => item.role === "system",
    );
    expect(repairSystem?.content).toContain("REPAIR MODE");
    expect(repairSystem?.content).toContain(PROMPT_CHUNK_ID_A);
  });

  it("does not retry when the repair attempt also returns malformed chunk labels", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";

    const invalidRaw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Still references something",
          chunkIds: ["facts"],
          confidence: "medium",
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp-bad",
        model: "gpt-test",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(invalidRaw) }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateContactDossier } = await import("./dossier-generator");
    await expect(
      generateContactDossier({
        contactId: CONTACT_ID,
        contactFacts: makeContactFacts(),
        chunks: [
          {
            chunkId: CHUNK_ID_A,
            sourceType: "application_answer",
            sourceLabel: "ultimate_vision",
            sourceTimestamp: null,
            text: "I want to be the voice of the ocean.",
          },
        ],
      }),
    ).rejects.toThrow();

    // One original call + one repair attempt = 2. Never a third.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry when the model returns a valid-format unknown chunk id that resolves on repair", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";

    const unknownRaw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Invented label",
          chunkIds: ["chunk_42"],
          confidence: "medium",
        },
      ],
    });
    const fixedRaw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Fixed to valid",
          chunkIds: [PROMPT_CHUNK_ID_A],
          confidence: "high",
        },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "resp-invented",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(unknownRaw) }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "resp-fixed",
          model: "gpt-test",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(fixedRaw) }],
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { generateContactDossier } = await import("./dossier-generator");
    const result = await generateContactDossier({
      contactId: CONTACT_ID,
      contactFacts: makeContactFacts(),
      chunks: [
        {
          chunkId: CHUNK_ID_A,
          sourceType: "application_answer",
          sourceLabel: "ultimate_vision",
          sourceTimestamp: null,
          text: "I want to be the voice of the ocean.",
        },
      ],
    });

    // The first response has chunk_42 (valid regex, unknown label). That
    // triggers an UnknownAnchorChunkIdError → repair retry → success.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.modelMetadata.repairAttempted).toBe(true);
    expect(result.dossier.evidenceAnchors[0]?.chunkIds).toEqual([CHUNK_ID_A]);
  });
});

describe("dossierResultSchema — chunk id regex", () => {
  it("rejects anchors with `chunk_` (no digits)", () => {
    expect(() =>
      dossierResultSchema.parse(
        makeRawDossier({
          evidenceAnchors: [
            {
              claim: "x",
              chunkIds: ["chunk_"],
              confidence: "high",
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it("rejects anchors with `facts` or other non-chunk labels", () => {
    expect(() =>
      dossierResultSchema.parse(
        makeRawDossier({
          evidenceAnchors: [
            {
              claim: "x",
              chunkIds: ["facts"],
              confidence: "high",
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it("rejects anchors with partial matches like `chunk_0` (must start with 1-9)", () => {
    expect(() =>
      dossierResultSchema.parse(
        makeRawDossier({
          evidenceAnchors: [
            {
              claim: "x",
              chunkIds: ["chunk_0"],
              confidence: "high",
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it("accepts anchors with valid `chunk_<positive int>` labels", () => {
    const parsed = dossierResultSchema.parse(
      makeRawDossier({
        evidenceAnchors: [
          {
            claim: "x",
            chunkIds: ["chunk_1", "chunk_42", "chunk_100"],
            confidence: "high",
          },
        ],
      }),
    );
    expect(parsed.evidenceAnchors[0]?.chunkIds).toEqual([
      "chunk_1",
      "chunk_42",
      "chunk_100",
    ]);
  });
});
