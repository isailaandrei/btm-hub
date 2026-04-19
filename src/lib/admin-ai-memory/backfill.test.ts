import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";
import { buildStableChunkId } from "./chunk-identity";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";

vi.mock("@/lib/data/admin-ai-memory", () => ({
  loadContactCrmSources: vi.fn(),
  listContactIdsForMemory: vi.fn(),
  deleteStaleCurrentCrmEvidenceChunksForContact: vi.fn(),
  upsertEvidenceChunks: vi.fn(),
  upsertContactDossier: vi.fn(),
  getContactDossier: vi.fn(),
}));

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  queryAdminAiContactFacts: vi.fn(),
}));

vi.mock("./dossier-generator", () => ({
  generateContactDossier: vi.fn(),
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
    generator_version: "dossier-prompt-v1",
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

function makeDossierFacts(contactId: string) {
  return {
    contact: {
      contactId,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
    },
    applications: {
      applicationCount: 0,
      applicationIds: [],
      programHistory: [],
      statusHistory: [],
    },
    tags: { tagIds: [], tagNames: [] },
    structuredFacts: {
      budgetValues: [],
      timeAvailabilityValues: [],
      startTimelineValues: [],
      btmCategoryValues: [],
      travelWillingnessValues: [],
      languageValues: [],
      countryOfResidenceValues: [],
      certificationLevelValues: [],
      yearsExperienceValues: [],
      involvementLevelValues: [],
    },
  };
}

describe("rebuildContactMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads sources, normalizes chunks, and generates a dossier", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");
    const generatorMod = await import("./dossier-generator");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
    });
    vi.mocked(retrievalMod.queryAdminAiContactFacts).mockResolvedValue([
      {
        contact_id: CONTACT_A,
        application_id: APP_ID,
        contact_name: "Joana",
        contact_email: "joana@example.com",
        contact_phone: null,
        program: "filmmaking",
        status: "reviewing",
        submitted_at: "2026-04-14T00:00:00Z",
        tag_ids: ["tag-1"],
        tag_names: ["Strong fit"],
        budget: "Medium",
        time_availability: "2-4 weeks",
        start_timeline: "Within 3 months",
        btm_category: "filmmaker",
        travel_willingness: "Yes",
        languages: "English, Portuguese",
        country_of_residence: "Portugal",
        certification_level: "Advanced",
        years_experience: "3-5",
        involvement_level: "Full-time",
      },
    ]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier).mockResolvedValue({
      dossier: {
        facts: makeDossierFacts(CONTACT_A),
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
      generatorVersion: "dossier-prompt-v1",
      modelMetadata: {
        provider: "openai",
        model: "gpt-test",
        responseId: null,
        usage: null,
      },
    });

    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });

    expect(dataMod.deleteStaleCurrentCrmEvidenceChunksForContact).toHaveBeenCalledWith({
      contactId: CONTACT_A,
      retainedSourceKeys: expect.arrayContaining([
        `application_answer:${APP_ID}:ultimate_vision`,
        `contact_note:note-${CONTACT_A}`,
      ]),
    });
    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalledTimes(1);
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
          structuredFacts: expect.objectContaining({
            budgetValues: ["Medium"],
            travelWillingnessValues: ["Yes"],
            languageValues: ["English, Portuguese"],
          }),
        }),
        chunks: expect.arrayContaining([
          expect.objectContaining({
            chunkId: buildStableChunkId(
              "application_answer",
              `${APP_ID}:ultimate_vision`,
            ),
          }),
        ]),
      }),
    );
    expect(result.status).toBe("rebuilt");
    expect(result.chunkCount).toBeGreaterThan(0);
  });

  it("skips rebuild when memory is already fresh", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const generatorMod = await import("./dossier-generator");
    const freshness = await import("./freshness");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
    });
    const chunkBuilder = await import("./chunk-builder");
    const expectedChunks = chunkBuilder.buildCurrentCrmChunksForContact({
      contact: makeContact(CONTACT_A),
      applications: [makeApplication(CONTACT_A)],
      contactNotes: [makeNote(CONTACT_A)],
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
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");
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
    });
    vi.mocked(retrievalMod.queryAdminAiContactFacts).mockResolvedValue([]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier).mockResolvedValue({
      dossier: {
        facts: makeDossierFacts(CONTACT_A),
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
      generatorVersion: "dossier-prompt-v1",
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
    });
    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });
    expect(result.status).toBe("no_chunks");
    expect(
      dataMod.deleteStaleCurrentCrmEvidenceChunksForContact,
    ).toHaveBeenCalledWith({
      contactId: CONTACT_A,
      retainedSourceKeys: [],
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
      }),
    );
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(generatorMod.generateContactDossier)
      .mockRejectedValueOnce(new Error("model down"))
      .mockResolvedValueOnce({
        dossier: {
          facts: makeDossierFacts(CONTACT_B),
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
        generatorVersion: "dossier-prompt-v1",
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
    });
    const { backfillContactMemory } = await import("./backfill");
    const stats = await backfillContactMemory({ contactIds: [CONTACT_A] });
    expect(stats.contactsProcessed).toBe(1);
    expect(dataMod.listContactIdsForMemory).not.toHaveBeenCalled();
  });
});
