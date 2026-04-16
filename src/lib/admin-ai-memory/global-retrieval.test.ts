import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
} from "@/types/admin-ai-memory";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  queryAdminAiContactFacts: vi.fn(),
  searchAdminAiEvidence: vi.fn(),
  listRecentAdminAiEvidence: vi.fn(),
}));

vi.mock("@/lib/data/admin-ai-memory", () => ({
  listRankingCards: vi.fn(),
  listContactDossiers: vi.fn(),
  listContactDossierStates: vi.fn(),
}));

vi.mock("./backfill", () => ({
  rebuildContactMemory: vi.fn(),
}));

const CONTACT_A = "11111111-1111-4111-8111-111111111111";
const CONTACT_B = "22222222-2222-4222-8222-222222222222";

function makePlan(overrides: Partial<AdminAiQueryPlan> = {}): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
    ...overrides,
  };
}

function makeFactRow(contactId: string): ContactFactRow {
  return {
    contact_id: contactId,
    application_id: null,
    contact_name: contactId,
    contact_email: null,
    contact_phone: null,
    program: "filmmaking",
    status: "reviewing",
    submitted_at: null,
    tag_ids: [],
    tag_names: [],
    budget: null,
    time_availability: null,
    start_timeline: null,
    btm_category: null,
    travel_willingness: null,
    languages: null,
    country_of_residence: null,
    certification_level: null,
    years_experience: null,
    involvement_level: null,
  };
}

function makeRankingCard(contactId: string): CrmAiContactRankingCard {
  return {
    contact_id: contactId,
    dossier_version: DOSSIER_SCHEMA_VERSION,
    source_fingerprint: "fp",
    facts_json: { name: contactId },
    top_fit_signals_json: [{ value: "ocean focus", confidence: "high" }],
    top_concerns_json: [],
    confidence_notes_json: [],
    short_summary: `Short summary for ${contactId}`,
    updated_at: "2026-04-15T00:00:00Z",
  };
}

function makeDossier(contactId: string): CrmAiContactDossier {
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
  };
}

describe("assembleGlobalCohortMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies structured filters and loads ranking cards for the cohort", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");

    vi.mocked(factsMod.queryAdminAiContactFacts).mockResolvedValue([
      makeFactRow(CONTACT_A),
    ]);
    vi.mocked(memoryMod.listContactDossierStates).mockResolvedValue([
      {
        contact_id: CONTACT_A,
        dossier_version: DOSSIER_SCHEMA_VERSION,
        generator_version: "dossier-prompt-v1",
        source_fingerprint: "fp",
        stale_at: null,
        last_built_at: "2026-04-15T00:00:00Z",
      },
    ]);
    vi.mocked(memoryMod.listRankingCards).mockResolvedValue([
      makeRankingCard(CONTACT_A),
    ]);

    const { assembleGlobalCohortMemory } = await import("./global-retrieval");
    const result = await assembleGlobalCohortMemory({ plan: makePlan() });

    expect(factsMod.queryAdminAiContactFacts).toHaveBeenCalledTimes(1);
    expect(vi.mocked(factsMod.queryAdminAiContactFacts)).toHaveBeenCalledWith({
      filters: [],
      limit: 250,
    });
    expect(memoryMod.listRankingCards).toHaveBeenCalledTimes(1);
    const cardsCall = vi.mocked(memoryMod.listRankingCards).mock.calls[0][0];
    expect(cardsCall.contactIds).toEqual(
      expect.arrayContaining([CONTACT_A]),
    );

    expect(result.candidates.map((c) => c.contact_id)).toEqual([CONTACT_A]);
    expect(result.rankingCards).toHaveLength(1);
    expect(result.contactsMissingRankingCards).toEqual([]);
  });

  it("caps the cohort at the configured ranking-card cap", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");

    const factRows = Array.from({ length: 350 }, (_, i) =>
      makeFactRow(`contact-${i}`),
    );
    vi.mocked(factsMod.queryAdminAiContactFacts).mockResolvedValue(factRows);
    vi.mocked(memoryMod.listContactDossierStates).mockResolvedValue([]);
    vi.mocked(memoryMod.listRankingCards).mockResolvedValue([]);

    const { assembleGlobalCohortMemory, MAX_RANKING_COHORT } = await import(
      "./global-retrieval"
    );
    const result = await assembleGlobalCohortMemory({ plan: makePlan() });
    expect(result.candidates.length).toBeLessThanOrEqual(MAX_RANKING_COHORT);
  });

  it("does not let requestedLimit shrink the ranking cohort read window", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");

    vi.mocked(factsMod.queryAdminAiContactFacts).mockResolvedValue([
      makeFactRow(CONTACT_A),
    ]);
    vi.mocked(memoryMod.listContactDossierStates).mockResolvedValue([]);
    vi.mocked(memoryMod.listRankingCards).mockResolvedValue([
      makeRankingCard(CONTACT_A),
    ]);

    const { assembleGlobalCohortMemory, MAX_RANKING_COHORT } = await import(
      "./global-retrieval"
    );
    await assembleGlobalCohortMemory({
      plan: makePlan({ requestedLimit: 3 }),
    });

    expect(vi.mocked(factsMod.queryAdminAiContactFacts)).toHaveBeenCalledWith({
      filters: [],
      limit: MAX_RANKING_COHORT,
    });
  });

  it("rebuilds missing or stale ranking memory for a small stale subset", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const backfillMod = await import("./backfill");

    vi.mocked(factsMod.queryAdminAiContactFacts).mockResolvedValue([
      makeFactRow(CONTACT_A),
      makeFactRow(CONTACT_B),
    ]);
    vi.mocked(memoryMod.listContactDossierStates).mockResolvedValue([
      {
        contact_id: CONTACT_A,
        dossier_version: DOSSIER_SCHEMA_VERSION,
        generator_version: "dossier-prompt-v1",
        source_fingerprint: "fp",
        stale_at: "2026-04-15T00:00:00Z",
        last_built_at: "2026-04-15T00:00:00Z",
      },
    ]);
    vi.mocked(memoryMod.listRankingCards)
      .mockResolvedValueOnce([makeRankingCard(CONTACT_A)])
      .mockResolvedValueOnce([
        makeRankingCard(CONTACT_A),
        makeRankingCard(CONTACT_B),
      ]);
    vi.mocked(backfillMod.rebuildContactMemory).mockResolvedValue({
      contactId: CONTACT_B,
      status: "rebuilt",
      chunkCount: 3,
      dossierUpserted: true,
      rankingCardUpserted: true,
    });

    const { assembleGlobalCohortMemory } = await import("./global-retrieval");
    const result = await assembleGlobalCohortMemory({ plan: makePlan() });

    expect(backfillMod.rebuildContactMemory).toHaveBeenCalledTimes(2);
    expect(backfillMod.rebuildContactMemory).toHaveBeenNthCalledWith(1, {
      contactId: CONTACT_A,
    });
    expect(backfillMod.rebuildContactMemory).toHaveBeenNthCalledWith(2, {
      contactId: CONTACT_B,
    });
    expect(result.contactsMissingRankingCards).toEqual([]);
    expect(result.rankingCards.map((card) => card.contact_id)).toEqual([
      CONTACT_A,
      CONTACT_B,
    ]);
  });
});

describe("expandFinalistEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads dossiers + evidence only for shortlisted contacts", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");

    vi.mocked(factsMod.searchAdminAiEvidence).mockResolvedValue([
      {
        evidenceId: `e1`,
        contactId: CONTACT_A,
        applicationId: null,
        sourceType: "application_answer",
        sourceId: "src-1",
        sourceLabel: "ultimate_vision",
        sourceTimestamp: null,
        program: "filmmaking",
        text: "ocean voice",
      },
    ]);
    vi.mocked(memoryMod.listContactDossiers).mockResolvedValue([
      makeDossier(CONTACT_A),
    ]);

    const { expandFinalistEvidence } = await import("./global-retrieval");
    const result = await expandFinalistEvidence({
      question: "who is best?",
      shortlistedContactIds: [CONTACT_A],
      textFocus: ["ocean"],
    });

    expect(memoryMod.listContactDossiers).toHaveBeenCalledWith({
      contactIds: [CONTACT_A],
    });
    const evidenceArgs = vi.mocked(factsMod.searchAdminAiEvidence).mock.calls[0][0];
    expect(evidenceArgs.contactIds).toEqual([CONTACT_A]);
    expect(result.evidence).toHaveLength(1);
    expect(result.dossiers).toHaveLength(1);
  });

  it("falls back to recent raw chunks when finalist keyword retrieval is empty", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");

    vi.mocked(factsMod.searchAdminAiEvidence).mockResolvedValue([]);
    vi.mocked(factsMod.listRecentAdminAiEvidence).mockResolvedValue([
      {
        evidenceId: "chunk-1",
        contactId: CONTACT_A,
        applicationId: null,
        sourceType: "contact_note",
        sourceId: "note-1",
        sourceLabel: "Contact note",
        sourceTimestamp: null,
        program: null,
        text: "Fallback chunk",
      },
    ]);
    vi.mocked(memoryMod.listContactDossiers).mockResolvedValue([
      makeDossier(CONTACT_A),
    ]);

    const { expandFinalistEvidence } = await import("./global-retrieval");
    const result = await expandFinalistEvidence({
      question: "who is best?",
      shortlistedContactIds: [CONTACT_A],
      textFocus: ["rare-term"],
    });

    expect(factsMod.listRecentAdminAiEvidence).toHaveBeenCalledWith({
      contactIds: [CONTACT_A],
      limit: 60,
    });
    expect(result.evidence).toEqual([
      expect.objectContaining({
        evidenceId: "chunk-1",
        text: "Fallback chunk",
      }),
    ]);
  });

  it("is a no-op when there is no shortlist", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const { expandFinalistEvidence } = await import("./global-retrieval");

    const result = await expandFinalistEvidence({
      question: "who is best?",
      shortlistedContactIds: [],
      textFocus: [],
    });
    expect(result.dossiers).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(factsMod.searchAdminAiEvidence).not.toHaveBeenCalled();
    expect(memoryMod.listContactDossiers).not.toHaveBeenCalled();
  });
});
