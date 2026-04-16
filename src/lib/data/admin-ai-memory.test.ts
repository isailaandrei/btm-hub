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
          sourceId: `${APP_ID}:ultimate_vision`,
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
        `${APP_ID}:ultimate_vision`,
      ),
      contact_id: CONTACT_ID,
      application_id: APP_ID,
      source_type: "application_answer",
      source_id: `${APP_ID}:ultimate_vision`,
      content_hash: "hash-1",
      chunk_version: 1,
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

// ===========================================================================
// upsertRankingCard / listRankingCards
// ===========================================================================

describe("upsertRankingCard", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("upserts ranking card keyed on contact_id", async () => {
    mock.mockQueryResult([{ contact_id: CONTACT_ID }]);
    const { upsertRankingCard } = await import("./admin-ai-memory");

    await upsertRankingCard({
      contactId: CONTACT_ID,
      dossierVersion: 1,
      sourceFingerprint: "fp-1",
      facts: { name: "Joana" },
      topFitSignals: [{ value: "ocean focus", confidence: "high" }],
      topConcerns: [],
      confidenceNotes: [],
      shortSummary: "Joana is ocean-focused.",
    });

    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_ranking_cards");
    expect(mock.query.upsert).toHaveBeenCalledTimes(1);
    const opts = mock.query.upsert.mock.calls[0][1] as
      | { onConflict: string }
      | undefined;
    expect(opts?.onConflict).toBe("contact_id");
  });
});

describe("listRankingCards", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("loads all ranking cards up to a cap", async () => {
    mock.mockQueryResult([]);
    const { listRankingCards } = await import("./admin-ai-memory");
    await listRankingCards({ limit: 250 });
    expect(mock.client.from).toHaveBeenCalledWith("crm_ai_contact_ranking_cards");
    expect(mock.query.limit).toHaveBeenCalledWith(250);
  });

  it("filters by provided contact ids when given", async () => {
    mock.mockQueryResult([]);
    const { listRankingCards } = await import("./admin-ai-memory");
    await listRankingCards({ contactIds: ["c1", "c2"], limit: 100 });
    expect(mock.query.in).toHaveBeenCalledWith("contact_id", ["c1", "c2"]);
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
