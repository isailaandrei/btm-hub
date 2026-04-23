import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";

vi.mock("@/lib/data/admin-ai-memory", () => ({
  loadContactCrmSources: vi.fn(),
  getContactDossier: vi.fn(),
  listCurrentCrmEvidenceChunkInputsForContact: vi.fn(),
  supersedeStaleCurrentCrmEvidenceChunksForContact: vi.fn(),
  upsertEvidenceChunks: vi.fn(),
  upsertEvidenceSubchunks: vi.fn(),
  upsertEmbeddings: vi.fn(),
  upsertFactObservations: vi.fn(),
  listFactObservationsForContact: vi.fn(),
  patchContactDossierStructural: vi.fn(),
}));

vi.mock("./embeddings", () => ({
  generateSubchunkEmbeddings: vi.fn(),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeContact(): Contact {
  return {
    id: CONTACT_ID,
    email: "joana@example.com",
    name: "Joana",
    phone: null,
    profile_id: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

function makeApplication(): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: CONTACT_ID,
    program: "filmmaking",
    status: "reviewing",
    answers: {
      ultimate_vision: "ocean voice",
      budget: "Medium",
      languages: ["English", "Portuguese"],
    },
    tags: [],
    admin_notes: [
      {
        author_id: "admin-1",
        author_name: "Andrei",
        text: "Strong interview — push to accept",
        created_at: "2026-04-17T10:00:00Z",
      },
    ],
    submitted_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
  };
}

function makeContactNote(): ContactNote {
  return {
    id: "note-1",
    contact_id: CONTACT_ID,
    author_id: "admin-1",
    author_name: "Andrei",
    text: "Met at the dock",
    created_at: "2026-04-16T10:00:00Z",
  };
}

function makeDossier(): CrmAiContactDossier {
  return {
    contact_id: CONTACT_ID,
    dossier_version: 2,
    generator_version: "dossier-prompt-v1",
    source_fingerprint: "fp-original",
    source_coverage: {
      applicationCount: 1,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
      whatsappMessageCount: 0,
      instagramMessageCount: 0,
      zoomChunkCount: 0,
    },
    facts_json: { stale: true },
    signals_json: {
      motivation: [{ value: "Ocean focus", confidence: "high" }],
      communicationStyle: [],
      reliabilitySignals: [],
      fitSignals: [],
      concerns: [],
    },
    contradictions_json: [],
    unknowns_json: [],
    evidence_anchors_json: [],
    short_summary: "Previous summary",
    medium_summary: "Previous medium",
    confidence_json: {},
    last_built_at: "2026-04-15T00:00:00Z",
    stale_at: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

describe("refreshContactMemoryFacts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("syncs chunks and patches dossier facts", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const embeddingsMod = await import("./embeddings");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
      contactTags: [
        {
          tagId: "tag-1",
          tagName: "red flag",
          assignedAt: "2026-04-16T12:00:00Z",
        },
      ],
    });
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([
      {
        id: "obs-1",
        contact_id: CONTACT_ID,
        observation_type: "application_field",
        field_key: "budget",
        value_type: "string",
        value_text: "Medium",
        value_json: "Medium",
        confidence: "high",
        source_chunk_ids: ["chunk-1"],
        source_timestamp: "2026-04-10T00:00:00Z",
        observed_at: "2026-04-10T00:00:00Z",
        invalidated_at: null,
        conflict_group: "application_field:budget",
        metadata_json: {
          fieldLabel: "Budget",
          sensitivity: "default",
        },
        created_at: "2026-04-10T00:00:00Z",
      },
    ]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(makeDossier());
    vi.mocked(embeddingsMod.generateSubchunkEmbeddings).mockResolvedValue({
      rows: [
        {
          targetType: "subchunk",
          targetId: "subchunk-1",
          embeddingModel: "text-embedding-3-small",
          embeddingVersion: "subchunk-context-v1",
          contentHash: "embedding-hash",
          embedding: [0.1],
        },
      ],
      model: "text-embedding-3-small",
      version: "subchunk-context-v1",
      usage: { prompt_tokens: 10 },
    });

    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    const result = await refreshContactMemoryFacts({ contactId: CONTACT_ID });

    expect(result.status).toBe("refreshed");
    expect(result.dossierPatched).toBe(true);
    expect(dataMod.supersedeStaleCurrentCrmEvidenceChunksForContact).toHaveBeenCalled();
    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalled();
    expect(dataMod.upsertEvidenceSubchunks).toHaveBeenCalled();
    expect(embeddingsMod.generateSubchunkEmbeddings).toHaveBeenCalled();
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
          valueText: "red flag",
        }),
      ]),
    });
    expect(dataMod.patchContactDossierStructural).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
        facts: expect.objectContaining({
          contact: expect.objectContaining({ contactId: CONTACT_ID }),
          tags: expect.objectContaining({ tagNames: ["red flag"] }),
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
        staleAt: expect.any(String),
      }),
    );
  });

  it("returns missing_sources when the contact does not exist", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue(null);
    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    const result = await refreshContactMemoryFacts({ contactId: CONTACT_ID });
    expect(result.status).toBe("missing_sources");
    expect(dataMod.upsertEvidenceChunks).not.toHaveBeenCalled();
    expect(dataMod.upsertEvidenceSubchunks).not.toHaveBeenCalled();
    expect(dataMod.upsertEmbeddings).not.toHaveBeenCalled();
    expect(dataMod.upsertFactObservations).not.toHaveBeenCalled();
    expect(dataMod.patchContactDossierStructural).not.toHaveBeenCalled();
  });

  it("syncs chunks but skips patches when no dossier exists yet", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const embeddingsMod = await import("./embeddings");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
      contactTags: [
        {
          tagId: "tag-2",
          tagName: "travel ready",
          assignedAt: "2026-04-16T12:00:00Z",
        },
      ],
    });
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(embeddingsMod.generateSubchunkEmbeddings).mockResolvedValue({
      rows: [],
      model: "text-embedding-3-small",
      version: "subchunk-context-v1",
      usage: null,
    });

    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    const result = await refreshContactMemoryFacts({ contactId: CONTACT_ID });
    expect(result.status).toBe("no_dossier");
    expect(result.dossierPatched).toBe(false);
    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalled();
    expect(dataMod.upsertEvidenceSubchunks).toHaveBeenCalled();
    expect(dataMod.upsertEmbeddings).not.toHaveBeenCalled();
    expect(dataMod.upsertFactObservations).toHaveBeenCalledWith({
      observations: expect.arrayContaining([
        expect.objectContaining({
          observationType: "contact_tag",
          valueText: "travel ready",
        }),
      ]),
    });
    expect(dataMod.patchContactDossierStructural).not.toHaveBeenCalled();
  });

  it("never calls the dossier generator (no OpenAI call in the facts-only path)", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
      contactTags: [],
    });
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(makeDossier());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    await refreshContactMemoryFacts({ contactId: CONTACT_ID });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("upgradeContactDossierFactsShape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("patches facts and structural metadata without touching evidence or model writes", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
      contactTags: [],
    });
    vi.mocked(dataMod.getContactDossier).mockResolvedValue({
      ...makeDossier(),
      stale_at: "2026-04-18T00:00:00Z",
    });
    vi.mocked(
      dataMod.listCurrentCrmEvidenceChunkInputsForContact,
    ).mockResolvedValue([
      {
        contactId: CONTACT_ID,
        applicationId: APP_ID,
        sourceType: "application_structured_field",
        logicalSourceId: `${APP_ID}:sf:budget`,
        sourceId: `${APP_ID}:sf:budget:v:hash`,
        sourceTimestamp: "2026-04-10T00:00:00Z",
        text: "Application field: Budget. Candidate reports Medium.",
        metadata: {
          sourceLabel: "Budget",
          fieldKey: "budget",
          fieldLabel: "Budget",
          valueType: "string",
          normalizedValue: "Medium",
          displayValue: "Medium",
        },
        contentHash: "chunk-hash",
        chunkVersion: 1,
      },
    ]);
    vi.mocked(dataMod.listFactObservationsForContact).mockResolvedValue([
      {
        id: "obs-1",
        contact_id: CONTACT_ID,
        observation_type: "application_field",
        field_key: "budget",
        value_type: "string",
        value_text: "Medium",
        value_json: "Medium",
        confidence: "high",
        source_chunk_ids: ["chunk-1"],
        source_timestamp: "2026-04-10T00:00:00Z",
        observed_at: "2026-04-10T00:00:00Z",
        invalidated_at: null,
        conflict_group: "application_field:budget",
        metadata_json: {
          fieldLabel: "Budget",
        },
        created_at: "2026-04-10T00:00:00Z",
      },
    ]);

    const { upgradeContactDossierFactsShape } = await import("./facts-refresh");
    const result = await upgradeContactDossierFactsShape({ contactId: CONTACT_ID });

    expect(result.status).toBe("upgraded");
    expect(result.dossierPatched).toBe(true);
    expect(
      dataMod.supersedeStaleCurrentCrmEvidenceChunksForContact,
    ).not.toHaveBeenCalled();
    expect(dataMod.upsertEvidenceChunks).not.toHaveBeenCalled();
    expect(dataMod.upsertEvidenceSubchunks).not.toHaveBeenCalled();
    expect(dataMod.upsertEmbeddings).not.toHaveBeenCalled();
    expect(dataMod.upsertFactObservations).not.toHaveBeenCalled();
    expect(dataMod.patchContactDossierStructural).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
        staleAt: "2026-04-18T00:00:00Z",
        sourceFingerprint: expect.any(String),
        sourceCoverage: expect.objectContaining({
          applicationCount: 1,
          contactNoteCount: 1,
          applicationAdminNoteCount: 0,
        }),
        facts: expect.objectContaining({
          structuredFieldDetails: {
            budget: expect.objectContaining({
              rawValues: ["Medium"],
              normalizedValues: ["Medium"],
            }),
          },
        }),
      }),
    );
  });
});
