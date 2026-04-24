import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";

vi.mock("@/lib/data/admin-ai-memory", () => ({
  loadContactCrmSources: vi.fn(),
  listContactIdsForMemory: vi.fn(),
  supersedeStaleCurrentCrmEvidenceChunksForContact: vi.fn(),
  upsertEvidenceChunks: vi.fn(),
  upsertEvidenceSubchunks: vi.fn(),
  upsertEmbeddings: vi.fn(),
  upsertFactObservations: vi.fn(),
  listFactObservationsForContact: vi.fn(),
  upsertContactDossier: vi.fn(),
  getContactDossier: vi.fn(),
}));

vi.mock("./dossier-generator", () => ({
  generateContactDossier: vi.fn(),
}));

vi.mock("./embeddings", () => ({
  generateSubchunkEmbeddings: vi.fn(),
}));

const CONTACT_A = "11111111-1111-4111-8111-111111111111";
const CONTACT_B = "22222222-2222-4222-8222-222222222222";
const APP_ID = "33333333-3333-4333-8333-333333333333";

function makeContact(id: string, overrides: Partial<Contact> = {}): Contact {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    phone: null,
    profile_id: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

function makeApplication(contactId: string): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: contactId,
    program: "filmmaking",
    status: "reviewing",
    answers: {
      ultimate_vision: "ocean voice",
      budget: "Medium",
      travel_willingness: "Yes",
      languages: ["English", "Portuguese"],
    },
    tags: [],
    admin_notes: [],
    submitted_at: "2026-04-14T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

function makeNote(contactId: string): ContactNote {
  return {
    id: `note-${contactId}`,
    contact_id: contactId,
    author_id: "admin-1",
    author_name: "Andrei",
    text: "great person",
    created_at: "2026-04-15T03:00:00Z",
  };
}

function makeDossier(
  contactId: string,
  overrides: Partial<CrmAiContactDossier> = {},
): CrmAiContactDossier {
  return {
    contact_id: contactId,
    dossier_version: DOSSIER_SCHEMA_VERSION,
    generator_version: DOSSIER_GENERATOR_VERSION,
    source_fingerprint: "fp",
    source_coverage: {
      applicationCount: 1,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
      whatsappMessageCount: 0,
      instagramMessageCount: 0,
      zoomChunkCount: 0,
    },
    facts_json: {},
    signals_json: {
      motivation: [],
      communicationStyle: [],
      reliabilitySignals: [],
      fitSignals: [],
      concerns: [],
    },
    contradictions_json: [],
    unknowns_json: [],
    evidence_anchors_json: [],
    short_summary: "s",
    medium_summary: "m",
    confidence_json: {},
    last_built_at: "2026-04-15T00:00:00Z",
    stale_at: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

describe("rebuildContactMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads sources, normalizes chunks, and generates a dossier", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const generatorMod = await import("./dossier-generator");
    const embeddingsMod = await import("./embeddings");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
      contactTags: [
        {
          tagId: "tag-1",
          tagName: "Strong fit",
          assignedAt: "2026-04-15T04:00:00Z",
        },
      ],
    });
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([
      {
        id: "obs-1",
        contact_id: CONTACT_A,
        observation_type: "application_field",
        field_key: "budget",
        value_type: "string",
        value_text: "Medium",
        value_json: "Medium",
        confidence: "high",
        source_chunk_ids: ["chunk-1"],
        source_timestamp: "2026-04-14T00:00:00Z",
        observed_at: "2026-04-14T00:00:00Z",
        invalidated_at: null,
        conflict_group: "application_field:budget",
        metadata_json: {
          fieldLabel: "Budget",
          sensitivity: "default",
        },
        created_at: "2026-04-14T00:00:00Z",
      },
    ]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier).mockResolvedValue({
      dossier: {
        signals: {
          motivation: [{ value: "ocean", confidence: "high" }],
          communicationStyle: [],
          reliabilitySignals: [],
          fitSignals: [],
          concerns: [],
        },
        contradictions: [],
        unknowns: [],
        evidenceAnchors: [],
        summary: { short: "s", medium: "m" },
      },
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      modelMetadata: {
        provider: "openai",
        model: "gpt-test",
        responseId: null,
        usage: null,
      },
    });
    vi.mocked(embeddingsMod.generateSubchunkEmbeddings).mockResolvedValue({
      rows: [
        {
          targetType: "subchunk",
          targetId: "subchunk-1",
          embeddingModel: "text-embedding-3-small",
          embeddingVersion: "subchunk-context-v1",
          contentHash: "embedding-hash",
          embedding: [0.1, 0.2, 0.3],
        },
      ],
      model: "text-embedding-3-small",
      version: "subchunk-context-v1",
      usage: { prompt_tokens: 12 },
    });

    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });

    expect(dataMod.supersedeStaleCurrentCrmEvidenceChunksForContact).toHaveBeenCalledWith({
      contactId: CONTACT_A,
      chunks: expect.arrayContaining([
        expect.objectContaining({
          sourceType: "application_answer",
          logicalSourceId: `${APP_ID}:ultimate_vision`,
        }),
        expect.objectContaining({
          sourceType: "contact_tag",
          logicalSourceId: `${CONTACT_A}:tag:tag-1`,
        }),
      ]),
    });
    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalledTimes(1);
    expect(dataMod.upsertEvidenceSubchunks).toHaveBeenCalledTimes(1);
    expect(embeddingsMod.generateSubchunkEmbeddings).toHaveBeenCalledTimes(1);
    expect(dataMod.upsertEmbeddings).toHaveBeenCalledWith({
      embeddings: [
        expect.objectContaining({
          targetType: "subchunk",
          targetId: "subchunk-1",
        }),
      ],
    });
    expect(dataMod.upsertFactObservations).toHaveBeenCalledWith({
      observations: expect.arrayContaining([
        expect.objectContaining({
          observationType: "contact_tag",
          valueText: "Strong fit",
        }),
      ]),
    });
    expect(dataMod.upsertContactDossier).toHaveBeenCalledTimes(1);
    expect(generatorMod.generateContactDossier).toHaveBeenCalledWith(
      expect.objectContaining({
        contactFacts: expect.objectContaining({
          contact: expect.objectContaining({
            contactId: CONTACT_A,
            contactName: CONTACT_A,
          }),
          applications: expect.objectContaining({
            programHistory: ["filmmaking"],
            statusHistory: ["reviewing"],
          }),
          tags: expect.objectContaining({
            tagNames: ["Strong fit"],
          }),
          structuredFieldDetails: expect.objectContaining({
            budget: expect.objectContaining({
              rawValues: ["Medium"],
              normalizedValues: ["Medium"],
            }),
          }),
          observationSummary: expect.objectContaining({
            conflictingFields: [],
          }),
        }),
        chunks: expect.arrayContaining([
          expect.objectContaining({
            chunkId: expect.any(String),
            sourceType: "application_answer",
          }),
        ]),
      }),
    );
    expect(dataMod.upsertContactDossier).toHaveBeenCalledWith(
      expect.objectContaining({
        generatorModel: "gpt-test",
        facts: expect.objectContaining({
          structuredFieldDetails: expect.objectContaining({
            budget: expect.objectContaining({
              rawValues: ["Medium"],
              normalizedValues: ["Medium"],
            }),
          }),
          observationSummary: expect.objectContaining({
            fieldHistory: expect.objectContaining({
              budget: expect.any(Array),
            }),
          }),
        }),
      }),
    );
    expect(result.status).toBe("rebuilt");
    expect(result.chunkCount).toBeGreaterThan(0);
  });

  it("keeps rebuilding even if embedding generation fails", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const generatorMod = await import("./dossier-generator");
    const embeddingsMod = await import("./embeddings");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
      contactTags: [],
    });
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier).mockResolvedValue({
      dossier: {
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
        summary: { short: "s", medium: "m" },
      },
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      modelMetadata: {
        provider: "openai",
        model: "gpt-test",
        responseId: null,
        usage: null,
      },
    });
    vi.mocked(embeddingsMod.generateSubchunkEmbeddings).mockRejectedValue(
      new Error("embedding provider down"),
    );

    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });

    expect(result.status).toBe("rebuilt");
    expect(dataMod.upsertEmbeddings).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[admin-ai-memory] subchunk embedding generation failed",
      expect.objectContaining({
        contactId: CONTACT_A,
        error: "embedding provider down",
      }),
    );
    warnSpy.mockRestore();
  });

  it("skips rebuild when memory is already fresh", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const generatorMod = await import("./dossier-generator");
    const freshness = await import("./freshness");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
      contactTags: [],
    });
    const chunkBuilder = await import("./chunk-builder");
    const expectedChunks = chunkBuilder.buildCurrentCrmChunksForContact({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
      contactTags: [],
    });
    const fingerprint = freshness.computeChunkSourceFingerprint(expectedChunks);

    vi.mocked(dataMod.getContactDossier).mockResolvedValue(
      makeDossier(CONTACT_A, { source_fingerprint: fingerprint }),
    );

    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });

    expect(result.status).toBe("fresh");
    expect(generatorMod.generateContactDossier).not.toHaveBeenCalled();
    expect(dataMod.upsertContactDossier).not.toHaveBeenCalled();
  });

  it("returns missing_sources when contact does not exist", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue(null);
    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });
    expect(result.status).toBe("missing_sources");
  });

  it("truncates the dossier prompt chunk set when total chars exceeds the cap (full chunks still upserted)", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const generatorMod = await import("./dossier-generator");

    // Build an application with ~60KB of text across allowlisted fields —
    // well past the 20_000-char dossier cap.
    const hugeApplication = {
      ...makeApplication(CONTACT_A),
      answers: {
        ultimate_vision: "x".repeat(8_000),
        inspiration_to_apply: "y".repeat(8_000),
        candidacy_reason: "z".repeat(8_000),
        anything_else: "a".repeat(8_000),
        questions_or_concerns: "b".repeat(8_000),
        current_occupation: "c".repeat(8_000),
        filmmaking_experience: "d".repeat(8_000),
      },
    };

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [hugeApplication],
      contactNotes: [makeNote(CONTACT_A)],
      contactTags: [],
    });
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier).mockResolvedValue({
      dossier: {
        signals: {
          motivation: [{ value: "m", confidence: "high" }],
          communicationStyle: [],
          reliabilitySignals: [],
          fitSignals: [],
          concerns: [],
        },
        contradictions: [],
        unknowns: [],
        evidenceAnchors: [],
        summary: { short: "s", medium: "m" },
      },
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      modelMetadata: {
        provider: "openai",
        model: "gpt-test",
        responseId: null,
        usage: null,
      },
    });

    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });

    expect(result.status).toBe("rebuilt");
    // All chunks get upserted to DB (full evidence for answer-time retrieval).
    const upsertedChunks = vi.mocked(dataMod.upsertEvidenceChunks).mock
      .calls[0]?.[0]?.chunks ?? [];
    expect(upsertedChunks.length).toBeGreaterThanOrEqual(8); // 7 answers + 1 note

    // The dossier prompt received a bounded subset.
    const dossierCall = vi.mocked(generatorMod.generateContactDossier).mock
      .calls[0]?.[0];
    const dossierChars =
      dossierCall?.chunks.reduce((sum, c) => sum + c.text.length, 0) ?? 0;
    expect(dossierChars).toBeLessThanOrEqual(20_000);
    // Must have dropped at least one chunk — total input was ~56K chars.
    expect(dossierCall?.chunks.length).toBeLessThan(upsertedChunks.length);
    // Contact note wins priority over application answers.
    expect(dossierCall?.chunks[0]?.sourceType).toBe("contact_note");
  });

  it("returns no_chunks when contact has no usable text", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [],
      contactNotes: [],
      contactTags: [],
    });
    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });
    expect(result.status).toBe("no_chunks");
    expect(
      dataMod.supersedeStaleCurrentCrmEvidenceChunksForContact,
    ).toHaveBeenCalledWith({
      contactId: CONTACT_A,
      chunks: [],
    });
  });
});

describe("backfillContactMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("iterates contacts, applies the limit, and returns aggregate stats", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.listContactIdsForMemory).mockResolvedValue([
      CONTACT_A,
      CONTACT_B,
    ]);
    vi.mocked(dataMod.loadContactCrmSources).mockImplementation(
      async ({ contactId }) => ({
        contact: makeContact(contactId),
        applications: [],
        contactNotes: [],
        contactTags: [],
      }),
    );

    const { backfillContactMemory } = await import("./backfill");
    const stats = await backfillContactMemory({ limit: 2 });

    expect(stats.contactsProcessed).toBe(2);
    expect(stats.contactsSucceeded).toBe(2);
    expect(stats.contactsFailed).toBe(0);
    expect(stats.failures).toEqual([]);
    expect(stats.skippedNoChunks).toBe(2);
  });

  it("keeps going past per-contact failures and reports them", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const generatorMod = await import("./dossier-generator");
    vi.mocked(dataMod.listContactIdsForMemory).mockResolvedValue([
      CONTACT_A,
      CONTACT_B,
    ]);
    vi.mocked(dataMod.loadContactCrmSources).mockImplementation(
      async ({ contactId }) => ({
        contact: makeContact(contactId),
        applications: [makeApplication(contactId)],
        contactNotes: [],
        contactTags: [],
      }),
    );
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier)
      .mockRejectedValueOnce(new Error("model down"))
      .mockResolvedValueOnce({
        dossier: {
          signals: {
            motivation: [{ value: "x", confidence: "high" }],
            communicationStyle: [],
            reliabilitySignals: [],
            fitSignals: [],
            concerns: [],
          },
          contradictions: [],
          unknowns: [],
          evidenceAnchors: [],
          summary: { short: "s", medium: "m" },
        },
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        modelMetadata: {
          provider: "openai",
          model: "gpt-test",
          responseId: null,
          usage: null,
        },
      });

    const { backfillContactMemory } = await import("./backfill");
    const stats = await backfillContactMemory({});
    expect(stats.contactsProcessed).toBe(2);
    expect(stats.contactsSucceeded).toBe(1);
    expect(stats.contactsFailed).toBe(1);
    expect(stats.failures[0]?.contactId).toBe(CONTACT_A);
    expect(stats.failures[0]?.error).toMatch(/model down/);
  });

  it("limits to provided contactIds when given", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [],
      contactNotes: [],
      contactTags: [],
    });
    const { backfillContactMemory } = await import("./backfill");
    const stats = await backfillContactMemory({ contactIds: [CONTACT_A] });
    expect(stats.contactsProcessed).toBe(1);
    expect(dataMod.listContactIdsForMemory).not.toHaveBeenCalled();
  });
});
