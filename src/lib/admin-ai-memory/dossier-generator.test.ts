import { describe, it, expect, vi, beforeEach } from "vitest";
import { dossierResultSchema } from "./dossier-schema";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const CHUNK_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHUNK_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeRawDossier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    facts: { name: "Joana", country: "Portugal" },
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
        chunkIds: [CHUNK_ID_A],
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

describe("dossierResultSchema", () => {
  it("accepts a well-formed dossier", () => {
    const parsed = dossierResultSchema.parse(makeRawDossier());
    expect(parsed.summary.short).toBeTypeOf("string");
    expect(parsed.signals.fitSignals).toHaveLength(1);
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
        contactFacts: { contact_id: CONTACT_ID, contact_name: "Joana" },
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
                text: JSON.stringify(makeRawDossier()),
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
      contactFacts: { contact_id: CONTACT_ID, contact_name: "Joana" },
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
  });

  it("rejects dossiers whose evidence anchors point to unknown chunk ids", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DOSSIER_MODEL = "gpt-test";
    const raw = makeRawDossier({
      evidenceAnchors: [
        {
          claim: "Has reef monitoring experience",
          chunkIds: ["chunk-not-in-prompt"],
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
        contactFacts: { contact_id: CONTACT_ID, contact_name: "Joana" },
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
});
