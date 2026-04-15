import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  queryAdminAiContactFacts: vi.fn(),
  searchAdminAiEvidence: vi.fn(),
}));

function makeCandidate(index: number, contactId = `contact-${index}`): ContactFactRow {
  return {
    contact_id: contactId,
    application_id: `application-${index}`,
    contact_name: `Candidate ${index}`,
    contact_email: `candidate-${index}@example.com`,
    contact_phone: null,
    program: "filmmaking",
    status: "reviewing",
    submitted_at: "2026-04-15T00:00:00Z",
    tag_ids: [],
    tag_names: [],
    budget: null,
    time_availability: null,
    start_timeline: null,
    travel_willingness: null,
    languages: null,
    country_of_residence: null,
    certification_level: null,
    years_experience: null,
    involvement_level: null,
  };
}

function makeEvidence(
  overrides: Partial<EvidenceItem> = {},
): EvidenceItem {
  return {
    evidenceId: "evidence-1",
    contactId: "contact-1",
    applicationId: "application-1",
    sourceType: "application_answer",
    sourceId: "application-1:ultimate_vision",
    sourceLabel: "ultimate_vision",
    sourceTimestamp: "2026-04-15T00:00:00Z",
    program: "filmmaking",
    text: "Strong ocean conservation motivation",
    ...overrides,
  };
}

function makePlan(overrides: Partial<AdminAiQueryPlan> = {}): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
    ...overrides,
  };
}

describe("assembleAdminAiEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("enforces the 25-candidate cap for global search", async () => {
    const {
      queryAdminAiContactFacts,
      searchAdminAiEvidence,
    } = await import("@/lib/data/admin-ai-retrieval");
    vi.mocked(queryAdminAiContactFacts).mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => makeCandidate(i + 1)),
    );
    vi.mocked(searchAdminAiEvidence).mockResolvedValue([]);

    const { assembleAdminAiEvidence, MAX_CANDIDATES } = await import("./retrieval");
    const result = await assembleAdminAiEvidence({
      plan: makePlan(),
    });

    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
    expect(queryAdminAiContactFacts).toHaveBeenCalledWith({
      filters: [],
      contactId: undefined,
      limit: 25,
    });
  });

  it("dedupes evidence rows by evidenceId and truncates snippets to the 500-char cap", async () => {
    const {
      queryAdminAiContactFacts,
      searchAdminAiEvidence,
    } = await import("@/lib/data/admin-ai-retrieval");
    vi.mocked(queryAdminAiContactFacts).mockResolvedValue([makeCandidate(1)]);
    vi.mocked(searchAdminAiEvidence).mockResolvedValue([
      makeEvidence({
        evidenceId: "dup-1",
        text: "x".repeat(700),
      }),
      makeEvidence({
        evidenceId: "dup-1",
        text: "different duplicate body",
      }),
    ]);

    const { assembleAdminAiEvidence, MAX_SNIPPET_CHARS } = await import("./retrieval");
    const result = await assembleAdminAiEvidence({
      plan: makePlan(),
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]?.text.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS);
  });

  it("throws when contact-scoped retrieval leaks evidence from another contact", async () => {
    const {
      queryAdminAiContactFacts,
      searchAdminAiEvidence,
    } = await import("@/lib/data/admin-ai-retrieval");
    vi.mocked(queryAdminAiContactFacts).mockResolvedValue([
      makeCandidate(1, "contact-allowed"),
      makeCandidate(2, "contact-allowed"),
    ]);
    vi.mocked(searchAdminAiEvidence).mockResolvedValue([
      makeEvidence({ contactId: "contact-allowed" }),
      makeEvidence({
        evidenceId: "leak-1",
        contactId: "contact-leaked",
      }),
    ]);

    const { assembleAdminAiEvidence } = await import("./retrieval");

    await expect(
      assembleAdminAiEvidence({
        plan: makePlan({
          mode: "contact_synthesis",
          contactId: "contact-allowed",
          requestedLimit: 1,
        }),
      }),
    ).rejects.toThrow(/contact-scope leak/i);
  });

  it("preserves application_admin_note evidence in the final pack", async () => {
    const {
      queryAdminAiContactFacts,
      searchAdminAiEvidence,
    } = await import("@/lib/data/admin-ai-retrieval");
    vi.mocked(queryAdminAiContactFacts).mockResolvedValue([makeCandidate(1)]);
    vi.mocked(searchAdminAiEvidence).mockResolvedValue([
      makeEvidence({
        evidenceId: "admin-note-1",
        sourceType: "application_admin_note",
        sourceId: "application-1:admin-note-1",
        sourceLabel: "Admin note (BTM)",
        text: "Admin noted strong follow-through and clear communication.",
      }),
    ]);

    const { assembleAdminAiEvidence } = await import("./retrieval");
    const result = await assembleAdminAiEvidence({
      plan: makePlan(),
    });

    expect(result.evidence).toEqual([
      expect.objectContaining({
        evidenceId: "admin-note-1",
        sourceType: "application_admin_note",
      }),
    ]);
  });

  it("marks the result as insufficient when both candidates and evidence are empty", async () => {
    const {
      queryAdminAiContactFacts,
      searchAdminAiEvidence,
    } = await import("@/lib/data/admin-ai-retrieval");
    vi.mocked(queryAdminAiContactFacts).mockResolvedValue([]);
    vi.mocked(searchAdminAiEvidence).mockResolvedValue([]);

    const { assembleAdminAiEvidence } = await import("./retrieval");
    const result = await assembleAdminAiEvidence({
      plan: makePlan(),
    });

    expect(result.insufficientEvidence).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  it("uses the full candidate cap for contact-scoped facts retrieval instead of the plan's requestedLimit", async () => {
    const {
      queryAdminAiContactFacts,
      searchAdminAiEvidence,
    } = await import("@/lib/data/admin-ai-retrieval");
    vi.mocked(queryAdminAiContactFacts).mockResolvedValue([
      makeCandidate(1, "contact-1"),
      makeCandidate(2, "contact-1"),
    ]);
    vi.mocked(searchAdminAiEvidence).mockResolvedValue([]);

    const { assembleAdminAiEvidence, MAX_CANDIDATES } = await import("./retrieval");
    await assembleAdminAiEvidence({
      plan: makePlan({
        mode: "contact_synthesis",
        contactId: "contact-1",
        requestedLimit: 1,
      }),
    });

    expect(queryAdminAiContactFacts).toHaveBeenCalledWith({
      filters: [],
      contactId: "contact-1",
      limit: MAX_CANDIDATES,
    });
  });
});
