import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
} from "@/types/admin-ai-memory";

vi.mock("@/lib/data/admin-ai-memory", () => ({
  loadContactCrmSources: vi.fn(),
  listContactIdsForMemory: vi.fn(),
  upsertEvidenceChunks: vi.fn(),
  upsertContactDossier: vi.fn(),
  upsertRankingCard: vi.fn(),
  getContactDossier: vi.fn(),
  listRankingCards: vi.fn(),
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
    dossier_version: 1,
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

describe("rebuildContactMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads sources, normalizes chunks, generates dossier, builds ranking card", async () => {
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
    vi.mocked(dataMod.listRankingCards).mockResolvedValue([]);
    vi.mocked(generatorMod.generateContactDossier).mockResolvedValue({
      dossier: {
        facts: { name: "A" },
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

    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalledTimes(1);
    expect(dataMod.upsertContactDossier).toHaveBeenCalledTimes(1);
    expect(dataMod.upsertRankingCard).toHaveBeenCalledTimes(1);
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
    vi.mocked(dataMod.listRankingCards).mockResolvedValue([
      {
        contact_id: CONTACT_A,
        dossier_version: 1,
        source_fingerprint: fingerprint,
        facts_json: {},
        top_fit_signals_json: [],
        top_concerns_json: [],
        confidence_notes_json: [],
        short_summary: "s",
        updated_at: "2026-04-15T00:00:00Z",
      } satisfies CrmAiContactRankingCard,
    ]);

    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });

    expect(result.status).toBe("fresh");
    expect(generatorMod.generateContactDossier).not.toHaveBeenCalled();
    expect(dataMod.upsertContactDossier).not.toHaveBeenCalled();
    expect(dataMod.upsertRankingCard).not.toHaveBeenCalled();
  });

  it("returns missing_sources when contact does not exist", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue(null);
    const { rebuildContactMemory } = await import("./backfill");
    const result = await rebuildContactMemory({ contactId: CONTACT_A });
    expect(result.status).toBe("missing_sources");
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
    vi.mocked(dataMod.listRankingCards).mockResolvedValue([]);
    vi.mocked(generatorMod.generateContactDossier)
      .mockRejectedValueOnce(new Error("model down"))
      .mockResolvedValueOnce({
        dossier: {
          facts: {},
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
