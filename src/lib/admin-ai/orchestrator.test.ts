import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
} from "@/types/admin-ai-memory";

vi.mock("./query-plan", () => ({
  buildAdminAiQueryPlan: vi.fn(),
}));

vi.mock("./provider", () => ({
  getAdminAiProvider: vi.fn(),
  getAdminAiRankingProvider: vi.fn(),
}));

vi.mock("@/lib/data/admin-ai", () => ({
  createAdminAiMessage: vi.fn(),
  createAdminAiCitations: vi.fn(),
}));

vi.mock("@/lib/data/contacts", () => ({
  getTags: vi.fn(),
}));

vi.mock("@/lib/admin-ai-memory/global-retrieval", () => ({
  assembleGlobalCohortMemory: vi.fn(),
  expandFinalistEvidence: vi.fn(),
}));

vi.mock("@/lib/admin-ai-memory/contact-retrieval", () => ({
  assembleContactScopedMemory: vi.fn(),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CONTACT_ID = "33333333-3333-4333-8333-333333333333";

function makePlan(overrides: Partial<AdminAiQueryPlan> = {}): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
    ...overrides,
  };
}

function makeContactPlan(): AdminAiQueryPlan {
  return {
    mode: "contact_synthesis",
    contactId: CONTACT_ID,
    structuredFilters: [],
    textFocus: ["motivation"],
    requestedLimit: 1,
  };
}

function makeCandidate(contactId: string): ContactFactRow {
  return {
    contact_id: contactId,
    application_id: APPLICATION_ID,
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
    dossier_version: 1,
    source_fingerprint: "fp",
    facts_json: {},
    top_fit_signals_json: [],
    top_concerns_json: [],
    confidence_notes_json: [],
    short_summary: "s",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

function makeDossier(contactId: string): CrmAiContactDossier {
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
  };
}

function makeEvidence(
  contactId: string,
  evidenceId = "evidence-1",
): EvidenceItem {
  return {
    evidenceId,
    contactId,
    applicationId: APPLICATION_ID,
    sourceType: "application_answer",
    sourceId: `${APPLICATION_ID}:ultimate_vision`,
    sourceLabel: "ultimate_vision",
    sourceTimestamp: "2026-04-15T00:00:00Z",
    program: "filmmaking",
    text: "I want to be the voice of the ocean.",
  };
}

function makeResponse(): AdminAiResponse {
  return {
    uncertainty: [],
    shortlist: [
      {
        contactId: CONTACT_ID,
        contactName: CONTACT_ID,
        whyFit: ["Ocean focus"],
        concerns: [],
        citations: [
          { evidenceId: "evidence-1", claimKey: "shortlist.0.whyFit.0" },
        ],
      },
    ],
  };
}

describe("runAdminAiAnalysis (global, two-pass)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("runs ranking pass over the cohort, then grounded synthesis on the shortlist", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const globalMod = await import("@/lib/admin-ai-memory/global-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(globalMod.assembleGlobalCohortMemory).mockResolvedValue({
      candidates: [makeCandidate(CONTACT_ID), makeCandidate(OTHER_CONTACT_ID)],
      rankingCards: [
        makeRankingCard(CONTACT_ID),
        makeRankingCard(OTHER_CONTACT_ID),
      ],
      contactsMissingRankingCards: [],
    });
    vi.mocked(globalMod.expandFinalistEvidence).mockResolvedValue({
      dossiers: [makeDossier(CONTACT_ID)],
      evidence: [makeEvidence(CONTACT_ID)],
    });

    const rankingGenerate = vi.fn().mockResolvedValue({
      shortlistedContactIds: [CONTACT_ID],
      cohortNotes: null,
      modelMetadata: { model: "ranking" },
    });
    const synthesisGenerate = vi.fn().mockResolvedValue({
      response: makeResponse(),
      modelMetadata: { model: "synthesis" },
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: rankingGenerate,
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: synthesisGenerate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "find strong candidates",
    });

    expect(rankingGenerate).toHaveBeenCalledTimes(1);
    expect(globalMod.expandFinalistEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        shortlistedContactIds: [CONTACT_ID],
      }),
    );
    expect(synthesisGenerate).toHaveBeenCalledTimes(1);
    expect(dataMod.createAdminAiCitations).toHaveBeenCalledWith({
      messageId: "assistant-1",
      citations: [
        expect.objectContaining({
          claim_key: "shortlist.0.whyFit.0",
          source_type: "application_answer",
          contact_id: CONTACT_ID,
        }),
      ],
    });
    expect(result.status).toBe("complete");
  });

  it("short-circuits when no candidates match the structured filters", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const globalMod = await import("@/lib/admin-ai-memory/global-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(globalMod.assembleGlobalCohortMemory).mockResolvedValue({
      candidates: [],
      rankingCards: [],
      contactsMissingRankingCards: [],
    });
    const rankingGenerate = vi.fn();
    const synthesisGenerate = vi.fn();
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: rankingGenerate,
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: synthesisGenerate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "find strong candidates",
    });

    expect(rankingGenerate).not.toHaveBeenCalled();
    expect(synthesisGenerate).not.toHaveBeenCalled();
    expect(dataMod.createAdminAiCitations).not.toHaveBeenCalled();
    expect(result.status).toBe("complete");
    expect(result.response?.uncertainty?.[0]).toMatch(/too thin/i);
  });

  it("short-circuits when ranking returns an empty shortlist", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const globalMod = await import("@/lib/admin-ai-memory/global-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(globalMod.assembleGlobalCohortMemory).mockResolvedValue({
      candidates: [makeCandidate(CONTACT_ID)],
      rankingCards: [makeRankingCard(CONTACT_ID)],
      contactsMissingRankingCards: [],
    });
    const rankingGenerate = vi.fn().mockResolvedValue({
      shortlistedContactIds: [],
      cohortNotes: "Cohort coverage too thin.",
      modelMetadata: { model: "ranking" },
    });
    const synthesisGenerate = vi.fn();
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: rankingGenerate,
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: synthesisGenerate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "find strong candidates",
    });

    expect(rankingGenerate).toHaveBeenCalledTimes(1);
    expect(synthesisGenerate).not.toHaveBeenCalled();
    expect(result.status).toBe("complete");
    expect(result.response?.uncertainty.join(" ")).toMatch(/cohort coverage/i);
  });
});

describe("runAdminAiAnalysis (contact, dossier-first)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses dossier + contact-scoped evidence and persists citations", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const contactMod = await import("@/lib/admin-ai-memory/contact-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makeContactPlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(contactMod.assembleContactScopedMemory).mockResolvedValue({
      dossier: makeDossier(CONTACT_ID),
      evidence: [makeEvidence(CONTACT_ID)],
      fallbackUsed: false,
    });
    const synthesisGenerate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        contactAssessment: {
          inferredQualities: ["Ocean focus."],
          concerns: [],
          citations: [
            {
              evidenceId: "evidence-1",
              claimKey: "contactAssessment.inferredQualities.0",
            },
          ],
        },
      } as AdminAiResponse,
      modelMetadata: { model: "synthesis" },
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: synthesisGenerate,
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "what do we know?",
      contactId: CONTACT_ID,
    });

    expect(contactMod.assembleContactScopedMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
      }),
    );
    expect(synthesisGenerate).toHaveBeenCalledTimes(1);
    expect(dataMod.createAdminAiCitations).toHaveBeenCalledWith({
      messageId: "assistant-1",
      citations: [
        expect.objectContaining({
          source_type: "application_answer",
          contact_id: CONTACT_ID,
        }),
      ],
    });
    expect(result.status).toBe("complete");
  });

  it("short-circuits when no dossier and no evidence are available", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const contactMod = await import("@/lib/admin-ai-memory/contact-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makeContactPlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(contactMod.assembleContactScopedMemory).mockResolvedValue({
      dossier: null,
      evidence: [],
      fallbackUsed: true,
    });
    const synthesisGenerate = vi.fn();
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: synthesisGenerate,
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "what do we know?",
      contactId: CONTACT_ID,
    });

    expect(synthesisGenerate).not.toHaveBeenCalled();
    expect(result.status).toBe("complete");
    expect(result.response?.uncertainty?.[0]).toMatch(/too thin/i);
  });

  it("short-circuits when a dossier exists but no raw evidence can be retrieved", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const contactMod = await import("@/lib/admin-ai-memory/contact-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makeContactPlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(contactMod.assembleContactScopedMemory).mockResolvedValue({
      dossier: makeDossier(CONTACT_ID),
      evidence: [],
      fallbackUsed: false,
    });
    const synthesisGenerate = vi.fn();
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: synthesisGenerate,
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "what do we know?",
      contactId: CONTACT_ID,
    });

    expect(synthesisGenerate).not.toHaveBeenCalled();
    expect(result.status).toBe("complete");
    expect(result.response?.uncertainty.join(" ")).toMatch(/raw evidence/i);
  });
});

describe("runAdminAiAnalysis (provider failures)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns failed when the synthesis provider is not configured", async () => {
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const contactMod = await import("@/lib/admin-ai-memory/contact-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makeContactPlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(contactMod.assembleContactScopedMemory).mockResolvedValue({
      dossier: makeDossier(CONTACT_ID),
      evidence: [makeEvidence(CONTACT_ID)],
      fallbackUsed: false,
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => false,
      getUnavailableReason: () => "Admin AI is not configured yet.",
      generate: vi.fn(),
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "what do we know?",
      contactId: CONTACT_ID,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not configured/i);
  });

  it("drops citations with unknown evidence ids from the persisted response instead of throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const contactMod = await import("@/lib/admin-ai-memory/contact-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makeContactPlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(contactMod.assembleContactScopedMemory).mockResolvedValue({
      dossier: makeDossier(CONTACT_ID),
      evidence: [makeEvidence(CONTACT_ID)],
      fallbackUsed: false,
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          uncertainty: [],
          contactAssessment: {
            inferredQualities: ["Real inferred quality."],
            concerns: [],
            citations: [
              {
                evidenceId: "evidence-1",
                claimKey: "contactAssessment.inferredQualities.0",
              },
              {
                evidenceId: "missing",
                claimKey: "contactAssessment.inferredQualities.1",
              },
            ],
          },
        } as AdminAiResponse,
        modelMetadata: { model: "synthesis" },
      }),
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-1",
    });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "what?",
      contactId: CONTACT_ID,
    });

    // The real citation survives, the `missing` one is dropped silently.
    expect(dataMod.createAdminAiCitations).toHaveBeenCalledWith({
      messageId: "assistant-1",
      citations: [
        expect.objectContaining({
          claim_key: "contactAssessment.inferredQualities.0",
          source_type: "application_answer",
        }),
      ],
    });
    expect(result.status).toBe("complete");
    expect(
      result.response?.contactAssessment?.citations.map((c) => c.evidenceId),
    ).toEqual(["evidence-1"]);
    expect(result.modelMetadata?.droppedEvidenceIds).toEqual(["missing"]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("outside the evidence pack"),
      expect.objectContaining({ droppedEvidenceIds: ["missing"] }),
    );
  });

  it("persists an empty citations array (not a throw) when every citation is foreign", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const planMod = await import("./query-plan");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const tagsMod = await import("@/lib/data/contacts");
    const contactMod = await import("@/lib/admin-ai-memory/contact-retrieval");

    vi.mocked(planMod.buildAdminAiQueryPlan).mockReturnValue(makeContactPlan());
    vi.mocked(tagsMod.getTags).mockResolvedValue([]);
    vi.mocked(contactMod.assembleContactScopedMemory).mockResolvedValue({
      dossier: makeDossier(CONTACT_ID),
      evidence: [makeEvidence(CONTACT_ID)],
      fallbackUsed: false,
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          uncertainty: [],
          contactAssessment: {
            inferredQualities: ["inferred"],
            concerns: [],
            citations: [
              {
                evidenceId: "ghost-1",
                claimKey: "contactAssessment.inferredQualities.0",
              },
            ],
          },
        } as AdminAiResponse,
        modelMetadata: {},
      }),
    });
    vi.mocked(providerMod.getAdminAiRankingProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generateRanking: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "asst" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "what?",
      contactId: CONTACT_ID,
    });

    expect(result.status).toBe("complete");
    expect(result.citations).toEqual([]);
    expect(
      result.response?.contactAssessment?.citations,
    ).toEqual([]);
    expect(result.modelMetadata?.droppedEvidenceIds).toEqual(["ghost-1"]);
  });
});
