import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";
import { buildStableChunkId } from "@/lib/admin-ai-memory/chunk-identity";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    role: "admin",
    email: "admin@test.local",
    display_name: "Admin",
    bio: null,
    avatar_url: null,
    preferences: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  })),
}));

type Harness = ReturnType<typeof createMockSupabaseClient>;

async function freshHarness(): Promise<Harness> {
  vi.resetModules();
  const mock = createMockSupabaseClient();
  const { createClient } = await import("@/lib/supabase/server");
  vi.mocked(createClient).mockResolvedValue(mock.client as never);
  const { requireAdmin } = await import("@/lib/auth/require-admin");
  vi.mocked(requireAdmin).mockClear();
  return mock;
}

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

// ===========================================================================
// upsertEvidenceChunks
// ===========================================================================

describe("upsertEvidenceChunks", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("calls requireAdmin and upserts onto crm_ai_evidence_chunks", async () => {
    mock.mockQueryResult([{ id: "chunk-1" }]);
    const { upsertEvidenceChunks } = await import("./admin-ai-memory");
    const { requireAdmin } = await import("@/lib/auth/require-admin");

    await upsertEvidenceChunks({
      chunks: [
        {
          contactId: CONTACT_ID,
          applicationId: APP_ID,
          sourceType: "application_answer",
          logicalSourceId: `${APP_ID}:ultimate_vision`,
          sourceId: `${APP_ID}:ultimate_vision:v:hash`,
          sourceTimestamp: "2026-04-15T00:00:00Z",
          text: "I want to be the voice of the ocean.",
          metadata: { sourceLabel: "ultimate_vision" },
          contentHash: "hash-1",
          chunkVersion: 1,
        },
      ],
    });

    expect(vi.mocked(requireAdmin)).toHaveBeenCalledTimes(1);
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_evidence_chunks");
    expect(mock.query.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mock.query.upsert.mock.calls[0];
    const rows = upsertCall[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: buildStableChunkId(
        "application_answer",
        `${APP_ID}:ultimate_vision:v:hash`,
      ),
      contact_id: CONTACT_ID,
      application_id: APP_ID,
      source_type: "application_answer",
      logical_source_id: `${APP_ID}:ultimate_vision`,
      source_id: `${APP_ID}:ultimate_vision:v:hash`,
      content_hash: "hash-1",
      chunk_version: 1,
      superseded_at: null,
    });
    const opts = upsertCall[1] as { onConflict: string } | undefined;
    expect(opts?.onConflict).toBe("source_type,source_id");
  });

  it("is a no-op when chunks is empty", async () => {
    const { upsertEvidenceChunks } = await import("./admin-ai-memory");
    await upsertEvidenceChunks({ chunks: [] });
    expect(mock.query.upsert).not.toHaveBeenCalled();
  });

  it("throws on DB error", async () => {
    mock.mockQueryResult(null, { message: "boom" });
    const { upsertEvidenceChunks } = await import("./admin-ai-memory");
    await expect(
      upsertEvidenceChunks({
        chunks: [
          {
            contactId: CONTACT_ID,
            applicationId: null,
            sourceType: "contact_note",
            logicalSourceId: "note-1",
            sourceId: "note-1",
            sourceTimestamp: null,
            text: "great person",
            metadata: {},
            contentHash: "h",
            chunkVersion: 1,
          },
        ],
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe("upsertEvidenceSubchunks", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("upserts subchunk rows onto crm_ai_evidence_subchunks", async () => {
    mock.mockQueryResult([{ id: "subchunk-1" }]);
    const { upsertEvidenceSubchunks } = await import("./admin-ai-memory");

    await upsertEvidenceSubchunks({
      subchunks: [
        {
          id: "subchunk-1",
          parentChunkId: "chunk-1",
          contactId: CONTACT_ID,
          applicationId: APP_ID,
          subchunkIndex: 0,
          text: "I want to work on ocean stories.",
          contentHash: "subhash-1",
          tokenEstimate: 7,
          metadata: {
            sourceType: "application_answer",
            sourceLabel: "ultimate_vision",
          },
        },
      ],
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_evidence_subchunks");
    expect(mock.query.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "subchunk-1",
          parent_chunk_id: "chunk-1",
          contact_id: CONTACT_ID,
          application_id: APP_ID,
          subchunk_index: 0,
          text: "I want to work on ocean stories.",
          content_hash: "subhash-1",
          token_estimate: 7,
          metadata_json: expect.objectContaining({
            sourceType: "application_answer",
          }),
        }),
      ],
      { onConflict: "id" },
    );
  });

  it("is a no-op when no subchunks are provided", async () => {
    const { upsertEvidenceSubchunks } = await import("./admin-ai-memory");
    await upsertEvidenceSubchunks({ subchunks: [] });
    expect(mock.query.upsert).not.toHaveBeenCalled();
  });
});

describe("upsertEmbeddings", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("upserts embedding rows onto crm_ai_embeddings", async () => {
    mock.mockQueryResult([{ id: "embedding-1" }]);
    const { upsertEmbeddings } = await import("./admin-ai-memory");

    await upsertEmbeddings({
      embeddings: [
        {
          targetType: "subchunk",
          targetId: "subchunk-1",
          embeddingModel: "text-embedding-3-small",
          embeddingVersion: "subchunk-context-v1",
          contentHash: "embedding-hash",
          embedding: [0.1, 0.2, 0.3],
        },
      ],
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_embeddings");
    expect(mock.query.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          target_type: "subchunk",
          target_id: "subchunk-1",
          embedding_model: "text-embedding-3-small",
          embedding_version: "subchunk-context-v1",
          content_hash: "embedding-hash",
          embedding: [0.1, 0.2, 0.3],
        }),
      ],
      {
        onConflict:
          "target_type,target_id,embedding_model,embedding_version,content_hash",
      },
    );
  });
});

describe("upsertFactObservations", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("upserts observation rows keyed by deterministic ids", async () => {
    mock.mockQueryResult([{ id: "obs-1" }]);
    const { upsertFactObservations } = await import("./admin-ai-memory");

    await upsertFactObservations({
      observations: [
        {
          id: "obs-1",
          contactId: CONTACT_ID,
          observationType: "application_field",
          fieldKey: "budget",
          valueType: "string",
          valueText: "$2,000 - $5,000",
          valueJson: "$2,000 - $5,000",
          confidence: "high",
          sourceChunkIds: ["chunk-1"],
          sourceTimestamp: "2026-04-15T00:00:00Z",
          observedAt: "2026-04-15T00:00:00Z",
          invalidatedAt: null,
          conflictGroup: "application_field:budget",
          metadata: {
            sourceType: "application_structured_field",
            sourceId: `${APP_ID}:sf:budget:v:hash`,
          },
        },
      ],
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_fact_observations");
    expect(mock.query.upsert).toHaveBeenCalledTimes(1);
    expect(mock.query.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "obs-1",
          contact_id: CONTACT_ID,
          observation_type: "application_field",
          field_key: "budget",
          value_type: "string",
          value_text: "$2,000 - $5,000",
          value_json: "$2,000 - $5,000",
          confidence: "high",
          source_chunk_ids: ["chunk-1"],
          conflict_group: "application_field:budget",
          metadata_json: expect.objectContaining({
            sourceType: "application_structured_field",
          }),
        }),
      ],
      { onConflict: "id" },
    );
  });

  it("is a no-op when no observations are provided", async () => {
    const { upsertFactObservations } = await import("./admin-ai-memory");
    await upsertFactObservations({ observations: [] });
    expect(mock.query.upsert).not.toHaveBeenCalled();
  });
});

describe("listFactObservationsForContact", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("returns ordered fact observations for a single contact", async () => {
    mock.mockQueryResult([
      {
        id: "obs-1",
        contact_id: CONTACT_ID,
        observation_type: "application_field",
        field_key: "budget",
        value_type: "string",
        value_text: "$2,000 - $5,000",
        value_json: "$2,000 - $5,000",
        confidence: "high",
        source_chunk_ids: ["chunk-1"],
        source_timestamp: "2026-04-15T00:00:00Z",
        observed_at: "2026-04-15T00:00:00Z",
        invalidated_at: null,
        conflict_group: "application_field:budget",
        metadata_json: {},
        created_at: "2026-04-15T00:00:00Z",
      },
    ]);
    const { listFactObservationsForContact } = await import("./admin-ai-memory");

    const out = await listFactObservationsForContact({ contactId: CONTACT_ID });

    expect(out).toHaveLength(1);
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_fact_observations");
    expect(mock.query.eq).toHaveBeenCalledWith("contact_id", CONTACT_ID);
    expect(mock.query.order).toHaveBeenCalledWith("observed_at", {
      ascending: false,
    });
  });
});

describe("supersedeStaleCurrentCrmEvidenceChunksForContact", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("marks missing or replaced current CRM chunks as superseded", async () => {
    mock.mockQueryResult([
      {
        id: "chunk-1",
        source_type: "application_answer",
        logical_source_id: `${APP_ID}:ultimate_vision`,
        source_id: `${APP_ID}:ultimate_vision:v:old`,
        superseded_at: null,
      },
      {
        id: "chunk-2",
        source_type: "application_structured_field",
        logical_source_id: `${APP_ID}:sf:budget`,
        source_id: `${APP_ID}:sf:budget:v:old`,
        superseded_at: null,
      },
    ]);
    mock.mockQueryResult([{ id: "chunk-1" }, { id: "chunk-2" }]);
    const { supersedeStaleCurrentCrmEvidenceChunksForContact } = await import(
      "./admin-ai-memory"
    );

    await supersedeStaleCurrentCrmEvidenceChunksForContact({
      contactId: CONTACT_ID,
      chunks: [
        {
          contactId: CONTACT_ID,
          applicationId: APP_ID,
          sourceType: "application_answer",
          logicalSourceId: `${APP_ID}:ultimate_vision`,
          sourceId: `${APP_ID}:ultimate_vision:v:new`,
          sourceTimestamp: "2026-04-15T00:00:00Z",
          text: "Updated vision",
          metadata: {},
          contentHash: "new-hash",
          chunkVersion: 1,
        },
      ],
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_evidence_chunks");
    expect(mock.query.eq).toHaveBeenCalledWith("contact_id", CONTACT_ID);
    expect(mock.query.in).toHaveBeenCalledWith("source_type", [
      "application_answer",
      "application_structured_field",
      "contact_note",
      "contact_tag",
      "application_admin_note",
    ]);
    expect(mock.query.update).toHaveBeenCalledTimes(1);
    expect(mock.query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        superseded_at: expect.any(String),
      }),
    );
    expect(mock.query.in).toHaveBeenLastCalledWith("id", ["chunk-1", "chunk-2"]);
  });

  it("does nothing when every current CRM chunk already matches the current versions", async () => {
    mock.mockQueryResult([
      {
        id: "chunk-1",
        source_type: "application_answer",
        logical_source_id: `${APP_ID}:ultimate_vision`,
        source_id: `${APP_ID}:ultimate_vision:v:hash`,
        superseded_at: null,
      },
    ]);
    const { supersedeStaleCurrentCrmEvidenceChunksForContact } = await import(
      "./admin-ai-memory"
    );

    await supersedeStaleCurrentCrmEvidenceChunksForContact({
      contactId: CONTACT_ID,
      chunks: [
        {
          contactId: CONTACT_ID,
          applicationId: APP_ID,
          sourceType: "application_answer",
          logicalSourceId: `${APP_ID}:ultimate_vision`,
          sourceId: `${APP_ID}:ultimate_vision:v:hash`,
          sourceTimestamp: "2026-04-15T00:00:00Z",
          text: "I want to be the voice of the ocean.",
          metadata: {},
          contentHash: "hash-1",
          chunkVersion: 1,
        },
      ],
    });

    expect(mock.query.update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// upsertContactDossier
// ===========================================================================

describe("upsertContactDossier", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("upserts a single dossier row keyed on contact_id", async () => {
    mock.mockQueryResult([{ contact_id: CONTACT_ID }]);
    const { upsertContactDossier } = await import("./admin-ai-memory");
    const { requireAdmin } = await import("@/lib/auth/require-admin");

    await upsertContactDossier({
      contactId: CONTACT_ID,
      dossierVersion: 1,
      generatorVersion: "dossier-prompt-v1",
      generatorModel: "gpt-5.4",
      sourceFingerprint: "fp-1",
      sourceCoverage: {
        applicationCount: 1,
        contactNoteCount: 0,
        applicationAdminNoteCount: 0,
        whatsappMessageCount: 0,
        instagramMessageCount: 0,
        zoomChunkCount: 0,
      },
      facts: { name: "Joana" },
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
      shortSummary: "Short.",
      mediumSummary: "Medium summary.",
      confidence: { overall: "medium" },
      staleAt: null,
    });

    expect(vi.mocked(requireAdmin)).toHaveBeenCalledTimes(1);
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_dossiers");
    expect(mock.query.upsert).toHaveBeenCalledTimes(1);
    const args = mock.query.upsert.mock.calls[0];
    const row = args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      contact_id: CONTACT_ID,
      dossier_version: 1,
      generator_version: "dossier-prompt-v1",
      generator_model: "gpt-5.4",
      source_fingerprint: "fp-1",
      short_summary: "Short.",
      medium_summary: "Medium summary.",
    });
    const opts = args[1] as { onConflict: string } | undefined;
    expect(opts?.onConflict).toBe("contact_id");
  });
});

// ===========================================================================
// getContactDossier / listContactDossiers
// ===========================================================================

describe("getContactDossier", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("returns null when no row exists", async () => {
    mock.mockQueryResult(null);
    const { getContactDossier } = await import("./admin-ai-memory");
    const out = await getContactDossier({ contactId: CONTACT_ID });
    expect(out).toBeNull();
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_dossiers");
    expect(mock.query.eq).toHaveBeenCalledWith("contact_id", CONTACT_ID);
    expect(mock.query.maybeSingle).toHaveBeenCalled();
  });

  it("returns the row when present", async () => {
    mock.mockQueryResult({
      contact_id: CONTACT_ID,
      dossier_version: 1,
      generator_version: "dossier-prompt-v1",
      source_fingerprint: "fp",
      source_coverage: {},
      facts_json: {},
      signals_json: {},
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
    });
    const { getContactDossier } = await import("./admin-ai-memory");
    const out = await getContactDossier({ contactId: CONTACT_ID });
    expect(out).not.toBeNull();
    expect(out?.contact_id).toBe(CONTACT_ID);
  });
});

describe("listContactDossiers", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("filters to provided contact ids when given", async () => {
    mock.mockQueryResult([]);
    const { listContactDossiers } = await import("./admin-ai-memory");
    await listContactDossiers({ contactIds: ["c1", "c2"] });
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_dossiers");
    expect(mock.query.in).toHaveBeenCalledWith("contact_id", ["c1", "c2"]);
  });

  it("returns [] without query when contactIds is empty", async () => {
    const { listContactDossiers } = await import("./admin-ai-memory");
    const out = await listContactDossiers({ contactIds: [] });
    expect(out).toEqual([]);
    expect(mock.client.from).not.toHaveBeenCalled();
  });
});

describe("listContactDossierStates", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("loads only freshness-related fields for the provided contact ids", async () => {
    mock.mockQueryResult([]);
    const { listContactDossierStates } = await import("./admin-ai-memory");
    await listContactDossierStates({ contactIds: ["c1", "c2"] });
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_dossiers");
    expect(mock.query.in).toHaveBeenCalledWith("contact_id", ["c1", "c2"]);
    expect(mock.query.select).toHaveBeenCalledWith(
      expect.stringContaining("generator_version"),
    );
    expect(mock.query.select).toHaveBeenCalledWith(
      expect.not.stringContaining("medium_summary"),
    );
  });

  it("returns [] without querying when contactIds is empty", async () => {
    const { listContactDossierStates } = await import("./admin-ai-memory");
    const out = await listContactDossierStates({ contactIds: [] });
    expect(out).toEqual([]);
    expect(mock.client.from).not.toHaveBeenCalled();
  });
});

describe("listCurrentCrmEvidenceChunkInputsForContact", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("loads unsuperseded current CRM chunk inputs and maps them to camelCase", async () => {
    mock.mockQueryResult([
      {
        contact_id: CONTACT_ID,
        application_id: APP_ID,
        source_type: "application_structured_field",
        logical_source_id: `${APP_ID}:sf:budget`,
        source_id: `${APP_ID}:sf:budget:v:hash`,
        source_timestamp: "2026-04-15T00:00:00Z",
        text: "Application field: Budget. Candidate reports Medium.",
        metadata_json: { fieldKey: "budget" },
        content_hash: "hash-1",
        chunk_version: 1,
      },
    ]);

    const { listCurrentCrmEvidenceChunkInputsForContact } = await import(
      "./admin-ai-memory"
    );
    const out = await listCurrentCrmEvidenceChunkInputsForContact({
      contactId: CONTACT_ID,
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_evidence_chunks");
    expect(mock.query.eq).toHaveBeenCalledWith("contact_id", CONTACT_ID);
    expect(mock.query.is).toHaveBeenCalledWith("superseded_at", null);
    expect(out).toEqual([
      {
        contactId: CONTACT_ID,
        applicationId: APP_ID,
        sourceType: "application_structured_field",
        logicalSourceId: `${APP_ID}:sf:budget`,
        sourceId: `${APP_ID}:sf:budget:v:hash`,
        sourceTimestamp: "2026-04-15T00:00:00Z",
        text: "Application field: Budget. Candidate reports Medium.",
        metadata: { fieldKey: "budget" },
        contentHash: "hash-1",
        chunkVersion: 1,
      },
    ]);
  });
});

describe("patchContactDossierStructural", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("patches facts and optional structural metadata without touching interpretive columns", async () => {
    mock.mockQueryResult([{ contact_id: CONTACT_ID }]);
    const { patchContactDossierStructural } = await import("./admin-ai-memory");

    await patchContactDossierStructural({
      contactId: CONTACT_ID,
      facts: { structuredFieldDetails: {} },
      staleAt: "2026-04-18T00:00:00Z",
      dossierVersion: 4,
      sourceFingerprint: "fp-2",
      sourceCoverage: {
        applicationCount: 1,
        contactNoteCount: 2,
        applicationAdminNoteCount: 1,
        whatsappMessageCount: 0,
        instagramMessageCount: 0,
        zoomChunkCount: 0,
      },
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_dossiers");
    expect(mock.query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        facts_json: { structuredFieldDetails: {} },
        stale_at: "2026-04-18T00:00:00Z",
        dossier_version: 4,
        source_fingerprint: "fp-2",
        source_coverage: expect.objectContaining({
          applicationCount: 1,
          contactNoteCount: 2,
        }),
      }),
    );
  });
});

// ===========================================================================
// findStaleContactMemory
// ===========================================================================

describe("findStaleContactMemory", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("returns contacts that are missing a dossier or have stale_at <= now", async () => {
    mock.mockQueryResult([
      { contact_id: "stale-1" },
      { contact_id: "stale-2" },
    ]);
    const { findStaleContactMemory } = await import("./admin-ai-memory");
    const out = await findStaleContactMemory({ limit: 50 });
    expect(out).toEqual(["stale-1", "stale-2"]);
    expect(mock.client.rpc).toHaveBeenCalledWith(
      "find_stale_admin_ai_contact_memory",
      expect.objectContaining({ p_limit: 50 }),
    );
  });
});
