import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
} from "@/types/admin-ai-memory";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";

const { afterMock } = vi.hoisted(() => ({
  afterMock: vi.fn((callback: () => Promise<void> | void) => {
    void callback();
  }),
}));

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  queryAdminAiContactFacts: vi.fn(),
  listAdminAiEvidenceByIds: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/data/admin-ai-memory", () => ({
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
    facts_json: {
      contact: { contactId, contactName: contactId },
      applications: { programHistory: ["filmmaking"], statusHistory: ["reviewing"] },
      tags: { tagNames: [] },
      structuredFacts: {},
    },
    signals_json: {
      motivation: [],
      communicationStyle: [],
      reliabilitySignals: [],
      fitSignals: [{ value: "Ocean focus", confidence: "high" }],
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

describe("assembleGlobalSinglePassCohort", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    afterMock.mockClear();
  });

  it("keeps every eligible contact in the cohort, including stale and missing dossier cases", async () => {
    const factsMod = await import("@/lib/data/admin-ai-retrieval");
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const backfillMod = await import("./backfill");

    vi.mocked(factsMod.queryAdminAiContactFacts).mockResolvedValue([
      makeFactRow(CONTACT_A),
      makeFactRow(CONTACT_B),
    ]);
    vi.mocked(factsMod.listAdminAiEvidenceByIds).mockResolvedValue([
      {
        evidenceId: "chunk-1",
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
    vi.mocked(memoryMod.listContactDossiers).mockResolvedValue([
      {
        ...makeDossier(CONTACT_A),
        evidence_anchors_json: [
          {
            claim: "Strong ocean storytelling motivation",
            chunkIds: ["chunk-1"],
            confidence: "high",
          },
        ],
      },
    ]);
    vi.mocked(backfillMod.rebuildContactMemory).mockResolvedValue({
      contactId: CONTACT_A,
      status: "rebuilt",
      chunkCount: 3,
      dossierUpserted: true,
    });

    const { assembleGlobalSinglePassCohort } = await import("./global-retrieval");
    const result = await assembleGlobalSinglePassCohort({ plan: makePlan() });

    expect(result.projections).toHaveLength(2);
    expect(result.projections[0]?.contactId).toBe(CONTACT_A);
    expect(result.projections[0]?.memoryStatus).toBe("stale");
    expect(result.projections[1]?.contactId).toBe(CONTACT_B);
    expect(result.projections[1]?.memoryStatus).toBe("missing");
    expect(result.supportRefMap.get("support_1")?.chunkIds).toEqual(["chunk-1"]);
    expect(result.evidence).toHaveLength(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });
});
