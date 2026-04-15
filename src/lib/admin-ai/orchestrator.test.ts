import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";

vi.mock("./query-plan", () => ({
  buildAdminAiQueryPlan: vi.fn(),
}));

vi.mock("./retrieval", () => ({
  assembleAdminAiEvidence: vi.fn(),
}));

vi.mock("./provider", () => ({
  getAdminAiProvider: vi.fn(),
}));

vi.mock("@/lib/data/admin-ai", () => ({
  createAdminAiMessage: vi.fn(),
  createAdminAiCitations: vi.fn(),
}));

vi.mock("@/lib/data/contacts", () => ({
  getTags: vi.fn(),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";

function makePlan(overrides: Partial<AdminAiQueryPlan> = {}): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
    ...overrides,
  };
}

function makeCandidate(): ContactFactRow {
  return {
    contact_id: CONTACT_ID,
    application_id: APPLICATION_ID,
    contact_name: "Joana",
    contact_email: "joana@example.com",
    contact_phone: null,
    program: "filmmaking",
    status: "reviewing",
    submitted_at: "2026-04-15T00:00:00Z",
    tag_ids: [],
    tag_names: [],
    budget: "Small budget (under 1,000 €/USD)",
    time_availability: "2-3 entire weeks at a time",
    start_timeline: "Within next 3 months",
    btm_category: "ASPIRING PROFESSIONAL",
    travel_willingness: "Yes, willing to travel internationally",
    languages: null,
    country_of_residence: null,
    certification_level: "Open Water",
    years_experience: "Less than 1 year",
    involvement_level: "Hobby only",
  };
}

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    evidenceId: "evidence-1",
    contactId: CONTACT_ID,
    applicationId: APPLICATION_ID,
    sourceType: "application_answer",
    sourceId: `${APPLICATION_ID}:ultimate_vision`,
    sourceLabel: "ultimate_vision",
    sourceTimestamp: "2026-04-15T00:00:00Z",
    program: "filmmaking",
    text: "I want to be the voice of the ocean.",
    ...overrides,
  };
}

function makeResponse(overrides: Partial<AdminAiResponse> = {}): AdminAiResponse {
  return {
    summary: "Joana looks like a strong fit for ocean-focused projects.",
    keyFindings: ["Strong conservation motivation."],
    uncertainty: [],
    ...overrides,
  };
}

describe("runAdminAiAnalysis", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds the query plan from the current question, scope, and available tags", async () => {
    const { buildAdminAiQueryPlan } = await import("./query-plan");
    const { assembleAdminAiEvidence } = await import("./retrieval");
    const { getAdminAiProvider } = await import("./provider");
    const { createAdminAiMessage, createAdminAiCitations } = await import("@/lib/data/admin-ai");
    const { getTags } = await import("@/lib/data/contacts");

    vi.mocked(getTags).mockResolvedValue([
      { id: "tag-1", category_id: "cat-1", name: "experienced", sort_order: 1, updated_at: "2026-04-15T00:00:00Z" },
    ]);
    vi.mocked(buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(assembleAdminAiEvidence).mockResolvedValue({
      candidates: [],
      evidence: [],
      insufficientEvidence: true,
    });
    vi.mocked(getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
    });
    vi.mocked(createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "find strong candidates",
    });

    expect(getTags).toHaveBeenCalledTimes(1);
    expect(buildAdminAiQueryPlan).toHaveBeenCalledWith({
      scope: "global",
      contactId: undefined,
      question: "find strong candidates",
      availableTags: [
        { id: "tag-1", name: "experienced" },
      ],
    });
  });

  it("short-circuits to a high-trust refusal when evidence is insufficient", async () => {
    const { buildAdminAiQueryPlan } = await import("./query-plan");
    const { assembleAdminAiEvidence } = await import("./retrieval");
    const { getAdminAiProvider } = await import("./provider");
    const { createAdminAiMessage, createAdminAiCitations } = await import("@/lib/data/admin-ai");
    const { getTags } = await import("@/lib/data/contacts");

    vi.mocked(getTags).mockResolvedValue([]);
    vi.mocked(buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(assembleAdminAiEvidence).mockResolvedValue({
      candidates: [],
      evidence: [],
      insufficientEvidence: true,
    });
    const generate = vi.fn();
    vi.mocked(getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who is best for this trip?",
    });

    expect(generate).not.toHaveBeenCalled();
    expect(createAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        role: "assistant",
        status: "complete",
        responseJson: expect.objectContaining({
          summary: expect.stringMatching(/not enough evidence/i),
        }),
      }),
    );
    expect(createAdminAiCitations).not.toHaveBeenCalled();
    expect(result.status).toBe("complete");
  });

  it("calls the provider exactly once on success and persists normalized citations separately", async () => {
    const { buildAdminAiQueryPlan } = await import("./query-plan");
    const { assembleAdminAiEvidence } = await import("./retrieval");
    const { getAdminAiProvider } = await import("./provider");
    const { createAdminAiMessage, createAdminAiCitations } = await import("@/lib/data/admin-ai");
    const { getTags } = await import("@/lib/data/contacts");

    vi.mocked(getTags).mockResolvedValue([]);
    vi.mocked(buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(assembleAdminAiEvidence).mockResolvedValue({
      candidates: [makeCandidate()],
      evidence: [makeEvidence()],
      insufficientEvidence: false,
    });
    const generate = vi.fn().mockResolvedValue({
      response: makeResponse({
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Joana",
            whyFit: ["Strong conservation motivation"],
            concerns: [],
            citations: [{ evidenceId: "evidence-1", claimKey: "shortlist.0.whyFit.0" }],
          },
        ],
      }),
      modelMetadata: { model: "gpt-4.1-mini" },
    });
    vi.mocked(getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "find strong candidates",
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(createAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        role: "assistant",
        status: "complete",
        queryPlan: makePlan(),
        responseJson: expect.objectContaining({
          summary: expect.any(String),
        }),
        modelMetadata: { model: "gpt-4.1-mini" },
      }),
    );
    expect(createAdminAiCitations).toHaveBeenCalledWith({
      messageId: "assistant-1",
      citations: [
        {
          claim_key: "shortlist.0.whyFit.0",
          source_type: "application_answer",
          source_id: `${APPLICATION_ID}:ultimate_vision`,
          contact_id: CONTACT_ID,
          application_id: APPLICATION_ID,
          source_label: "ultimate_vision",
          snippet: "I want to be the voice of the ocean.",
        },
      ],
    });
    expect(result.status).toBe("complete");
    expect(result.citations).toHaveLength(1);
  });

  it("returns a safe failed result when the provider is not configured", async () => {
    const { buildAdminAiQueryPlan } = await import("./query-plan");
    const { assembleAdminAiEvidence } = await import("./retrieval");
    const { getAdminAiProvider } = await import("./provider");
    const { createAdminAiMessage, createAdminAiCitations } = await import("@/lib/data/admin-ai");
    const { getTags } = await import("@/lib/data/contacts");

    vi.mocked(getTags).mockResolvedValue([]);
    vi.mocked(buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(assembleAdminAiEvidence).mockResolvedValue({
      candidates: [makeCandidate()],
      evidence: [makeEvidence()],
      insufficientEvidence: false,
    });
    const generate = vi.fn();
    vi.mocked(getAdminAiProvider).mockReturnValue({
      isConfigured: () => false,
      getUnavailableReason: () => "Admin AI is not configured yet.",
      generate,
    });
    vi.mocked(createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "find strong candidates",
    });

    expect(generate).not.toHaveBeenCalled();
    expect(createAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        content: "Admin AI is not configured yet.",
        responseJson: null,
      }),
    );
    expect(createAdminAiCitations).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
  });

  it("fails when the provider returns citations for unknown evidence ids", async () => {
    const { buildAdminAiQueryPlan } = await import("./query-plan");
    const { assembleAdminAiEvidence } = await import("./retrieval");
    const { getAdminAiProvider } = await import("./provider");
    const { createAdminAiMessage, createAdminAiCitations } = await import("@/lib/data/admin-ai");
    const { getTags } = await import("@/lib/data/contacts");

    vi.mocked(getTags).mockResolvedValue([]);
    vi.mocked(buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(assembleAdminAiEvidence).mockResolvedValue({
      candidates: [makeCandidate()],
      evidence: [makeEvidence()],
      insufficientEvidence: false,
    });
    vi.mocked(getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: makeResponse({
          shortlist: [
            {
              contactId: CONTACT_ID,
              contactName: "Joana",
              whyFit: ["Strong conservation motivation"],
              concerns: [],
              citations: [{ evidenceId: "missing-evidence", claimKey: "shortlist.0.whyFit.0" }],
            },
          ],
        }),
        modelMetadata: { model: "gpt-4.1-mini" },
      }),
    });
    vi.mocked(createAdminAiMessage)
      .mockResolvedValueOnce({ id: "assistant-failed" });
    vi.mocked(createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");

    await expect(
      runAdminAiAnalysis({
        scope: "global",
        threadId: "thread-1",
        question: "find strong candidates",
      }),
    ).rejects.toThrow(/unknown evidence id/i);

    expect(createAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        responseJson: null,
      }),
    );
    expect(createAdminAiCitations).not.toHaveBeenCalled();
  });

  it("fails when the provider returns a payload that does not match AdminAiResponse", async () => {
    const { buildAdminAiQueryPlan } = await import("./query-plan");
    const { assembleAdminAiEvidence } = await import("./retrieval");
    const { getAdminAiProvider } = await import("./provider");
    const { createAdminAiMessage, createAdminAiCitations } = await import("@/lib/data/admin-ai");
    const { getTags } = await import("@/lib/data/contacts");

    vi.mocked(getTags).mockResolvedValue([]);
    vi.mocked(buildAdminAiQueryPlan).mockReturnValue(makePlan());
    vi.mocked(assembleAdminAiEvidence).mockResolvedValue({
      candidates: [makeCandidate()],
      evidence: [makeEvidence()],
      insufficientEvidence: false,
    });
    vi.mocked(getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          summary: "broken",
          keyFindings: "not-an-array",
          uncertainty: [],
        },
        modelMetadata: { model: "gpt-4.1-mini" },
      }),
    });
    vi.mocked(createAdminAiMessage).mockResolvedValue({ id: "assistant-failed" });
    vi.mocked(createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");

    await expect(
      runAdminAiAnalysis({
        scope: "global",
        threadId: "thread-1",
        question: "find strong candidates",
      }),
    ).rejects.toThrow(/adminairesponse validation failed/i);

    expect(createAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        responseJson: null,
      }),
    );
    expect(createAdminAiCitations).not.toHaveBeenCalled();
  });
});
