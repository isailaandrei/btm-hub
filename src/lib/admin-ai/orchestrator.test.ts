import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAiResponse, EvidenceItem } from "@/types/admin-ai";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

vi.mock("./provider", () => ({
  getAdminAiProvider: vi.fn(),
  getAdminAiScanMode: vi.fn(() => "single"),
}));

vi.mock("@/lib/data/admin-ai", () => ({
  createAdminAiMessage: vi.fn(),
  createAdminAiCitations: vi.fn(),
}));

vi.mock("@/lib/data/contact-cards", () => ({
  loadEligibleContactCardRecords: vi.fn(),
  loadContactCardRecords: vi.fn(),
}));

vi.mock("@/lib/conversations/retrieval", () => ({
  retrieveConversationEvidence: vi.fn(),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CONTACT_ID = "33333333-3333-4333-8333-333333333333";
const MISSING_BUDGET_CONTACT_ID = "55555555-5555-4555-8555-555555555555";

function makeRecord(
  contactId = CONTACT_ID,
  answers: Record<string, unknown> = {
    ultimate_vision: "I want to film ocean conservation stories.",
  },
): ContactCardRecord {
  return {
    contact: {
      id: contactId,
      name:
        contactId === CONTACT_ID
          ? "Marina Costa"
          : contactId === OTHER_CONTACT_ID
            ? "Ivo Santos"
            : "No Budget",
      email: `${contactId}@example.com`,
      phone: null,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: [
      {
        id: contactId === CONTACT_ID ? APPLICATION_ID : "44444444-4444-4444-8444-444444444444",
        user_id: null,
        contact_id: contactId,
        program: "filmmaking",
        status: "reviewing",
        answers,
        tags: [],
        admin_notes: [],
        submitted_at: "2026-03-02T00:00:00Z",
        updated_at: "2026-03-02T00:00:00Z",
      },
    ],
    contactNotes: [],
    contactTags: [],
  };
}

function makeEvidence(evidenceId = `application_answer:${APPLICATION_ID}:ultimate_vision`): EvidenceItem {
  return {
    evidenceId,
    contactId: CONTACT_ID,
    applicationId: APPLICATION_ID,
    sourceType: "application_answer",
    sourceId: `${APPLICATION_ID}:ultimate_vision`,
    sourceLabel: "Ultimate Vision",
    sourceTimestamp: "2026-03-02T00:00:00Z",
    program: "filmmaking",
    text: "I want to film ocean conservation stories.",
  };
}

function enableEvidence() {
  vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "1");
}

// Distinct filler records to push a cohort past MAP_CHUNK_SIZE (30) so the map
// stage actually runs (small corpora are intentionally skipped).
function makeFillerRecords(count: number): ContactCardRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeRecord(`${String(i).padStart(8, "0")}-2222-4222-8222-222222222222`),
  );
}

function makeTaggedRecord(
  contactId: string,
  categoryName: string,
  tagName = "Potential Candidate",
): ContactCardRecord {
  return {
    ...makeRecord(contactId),
    contactTags: [
      {
        tagId: `${contactId}-tag`,
        tagName,
        categoryName,
        assignedAt: "2026-03-02T00:00:00Z",
      },
    ],
  };
}

describe("runAdminAiAnalysis (raw cards)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits evidence when disabled while generating and returning an answer", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([
      makeEvidence("whatsapp_message:message-1"),
    ]);
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["Ocean conservation mission match"],
            concerns: [],
            citations: [
              {
                evidenceId: "e1",
                claimKey: "shortlist.0.whyFit.0",
              },
            ],
          },
        ],
      } as AdminAiResponse,
      modelMetadata: { model: "card-model" },
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "Find ocean storytellers",
    });

    expect(retrievalMod.retrieveConversationEvidence).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: [],
      }),
    );
    const generatedCards = (generate.mock.calls[0]?.[0].cards ?? []) as Array<{
      text: string;
    }>;
    expect(generatedCards.map((card) => card.text).join("\n")).not.toMatch(
      /\[e\d+\]/,
    );
    expect(dataMod.createAdminAiCitations).not.toHaveBeenCalled();
    expect(result.citations).toEqual([]);
    expect(result.response?.shortlist?.[0]?.citations).toEqual([]);
    expect(result.modelMetadata?.rawCards).toEqual(
      expect.objectContaining({
        evidenceEnabled: false,
      }),
    );
  });

  it("enforces and discloses requested minimum budget as a hard global shortlist constraint", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID, {
        budget: "All-In budget (>12,000 €/USD)",
        ultimate_vision: "I want to film ocean conservation stories.",
      }),
      makeRecord(OTHER_CONTACT_ID, {
        budget: "Advanced budget (3,000 - 6,000 €/USD)",
        ultimate_vision: "I want to film ocean conservation stories.",
      }),
      makeRecord(MISSING_BUDGET_CONTACT_ID, {
        ultimate_vision: "I want to film ocean conservation stories.",
      }),
    ]);
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["Budget and experience match."],
            concerns: [],
            citations: [],
          },
          {
            contactId: OTHER_CONTACT_ID,
            contactName: "Ivo Santos",
            whyFit: ["Experience match but below budget."],
            concerns: [],
            citations: [],
          },
        ],
      } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question:
        "give me a list of all female candidates that have budget 6k or more and have extensive prior experience with filming or photography",
    });

    const cardText = ((generate.mock.calls[0]?.[0].cards ?? []) as Array<{
      text: string;
    }>).map((card) => card.text).join("\n");
    expect(cardText).toContain("Marina Costa");
    expect(cardText).not.toContain("Ivo Santos");
    expect(cardText).not.toContain("No Budget");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        queryPlan: expect.objectContaining({
          requestedLimit: 10,
        }),
      }),
    );
    expect(result.response?.shortlist?.map((entry) => entry.contactId)).toEqual([
      CONTACT_ID,
    ]);
    // The below-budget contact was prefiltered out, so its card was never sent;
    // the model returning it is an unresolvable reference the id-repair drops.
    expect(result.response?.uncertainty).toContain(
      "1 entry dropped: unresolvable contact references.",
    );
    expect(result.response?.uncertainty).toContain(
      "2 contacts were excluded by the deterministic budget filter ($6,000 minimum) before synthesis because the available CRM data did not satisfy the user's hard constraint.",
    );
    expect(result.modelMetadata?.hardConstraints).toEqual(
      expect.objectContaining({
        budgetMin: 6000,
        prefilteredContactCount: 2,
      }),
    );
    expect(result.modelMetadata?.idIntegrity).toEqual({ repairs: 0, drops: 1 });
    // No completeJson on this mock provider → planner unavailable → legacy path.
    expect(result.modelMetadata?.plannerUnavailable).toBe(true);
  });

  it("runs global analysis over rendered eligible contact cards and persists grounded citations", async () => {
    enableEvidence();
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
      makeRecord(OTHER_CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([
      {
        evidenceId: "whatsapp_message:message-1",
        contactId: CONTACT_ID,
        applicationId: null,
        sourceType: "whatsapp_message",
        sourceId: "message-1",
        sourceLabel: "WhatsApp message",
        sourceTimestamp: "2026-06-11T10:00:00Z",
        program: null,
        text: "Budget is around $5k.",
      },
    ]);
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["Ocean conservation mission match"],
            concerns: [],
            citations: [
              {
                evidenceId: "e1",
                claimKey: "shortlist.0.whyFit.0",
              },
            ],
          },
        ],
      } as AdminAiResponse,
      modelMetadata: { model: "card-model" },
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "Find ocean storytellers",
    });

    expect(cardDataMod.loadEligibleContactCardRecords).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "global",
        question: "Find ocean storytellers",
        cards: expect.arrayContaining([
          expect.objectContaining({
            contactId: CONTACT_ID,
            text: expect.stringContaining("Contact: Marina Costa"),
          }),
          expect.objectContaining({
            text: expect.stringContaining("[e1]"),
          }),
        ]),
        // Card-derived evidence must NOT be sent to the model — its ids are
        // already inline in the card text, and duplicating the items in the
        // prompt made global payloads exceed provider limits. Only the
        // conversation-retrieval evidence rides along.
        evidence: [
          expect.objectContaining({
            evidenceId: "e3",
          }),
        ],
        promptCacheKey: expect.stringMatching(/^admin-ai-cards:/),
      }),
    );
    const generatedCards = (generate.mock.calls[0]?.[0].cards ?? []) as Array<{
      text: string;
    }>;
    expect(generatedCards.map((card) => card.text).join("\n")).not.toContain(
      "application_answer:",
    );
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

  it("allows global shortlist entries grounded only in structured field citations", async () => {
    enableEvidence();
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID, {
        budget: "All-In budget (>12,000 €/USD)",
      }),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["Budget meets the requested minimum."],
            concerns: [],
            citations: [
              {
                evidenceId: "e1",
                claimKey: "shortlist.0.whyFit.0",
              },
            ],
          },
        ],
      } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "Find candidates with budget 6k or more",
    });

    const cardText = ((generate.mock.calls[0]?.[0].cards ?? []) as Array<{
      text: string;
    }>).map((card) => card.text).join("\n");
    expect(cardText).toContain("Structured facts: Budget=All-In budget");
    expect(cardText).toContain("[e1]");
    expect(result.response?.shortlist?.map((entry) => entry.contactId)).toEqual([
      CONTACT_ID,
    ]);
    expect(dataMod.createAdminAiCitations).toHaveBeenCalledWith({
      messageId: "assistant-1",
      citations: [
        expect.objectContaining({
          source_type: "application_structured_field",
          source_label: "Budget",
          snippet: "All-In budget (>12,000 €/USD)",
        }),
      ],
    });
  });

  it("drops unsupported global shortlist entries after citation guardrails", async () => {
    enableEvidence();
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
      makeRecord(OTHER_CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          uncertainty: [],
          shortlist: [
            {
              contactId: CONTACT_ID,
              contactName: "Marina Costa",
              whyFit: ["Grounded"],
              concerns: [],
              citations: [
                {
                  evidenceId: "e1",
                  claimKey: "shortlist.0.whyFit.0",
                },
              ],
            },
            {
              contactId: OTHER_CONTACT_ID,
              contactName: "Ivo Santos",
              whyFit: ["Unsupported"],
              concerns: [],
              citations: [
                {
                  evidenceId: "e999",
                  claimKey: "shortlist.1.whyFit.0",
                },
              ],
            },
          ],
        } as AdminAiResponse,
        modelMetadata: {},
      }),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "Find candidates",
    });

    expect(result.response?.shortlist?.map((entry) => entry.contactId)).toEqual([
      CONTACT_ID,
    ]);
    expect(result.response?.uncertainty).toContain(
      "Some model-returned shortlist entries were dropped because their citations could not be resolved to raw evidence.",
    );
    expect(result.modelMetadata?.droppedEvidenceIds).toEqual(["e999"]);
  });

  it("runs contact analysis over one rendered contact card", async () => {
    enableEvidence();
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        contactAssessment: {
          inferredQualities: ["Mission-driven ocean storyteller."],
          concerns: [],
          citations: [
            {
              evidenceId: "e1",
              claimKey: "contactAssessment.inferredQualities.0",
            },
          ],
        },
      } as AdminAiResponse,
      modelMetadata: { model: "card-model" },
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "What do we know?",
      contactId: CONTACT_ID,
    });

    expect(cardDataMod.loadContactCardRecords).toHaveBeenCalledWith({
      contactIds: [CONTACT_ID],
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "contact",
        cards: [
          expect.objectContaining({
            contactId: CONTACT_ID,
            text: expect.stringContaining("[e1]"),
          }),
        ],
      }),
    );
    expect(result.status).toBe("complete");
  });

  it("returns a visible insufficient-evidence response when no card evidence exists", async () => {
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadContactCardRecords).mockResolvedValue([]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "What do we know?",
      contactId: CONTACT_ID,
    });

    expect(result.status).toBe("complete");
    expect(result.response?.uncertainty.join(" ")).toMatch(/too thin/i);
  });

  it("returns failed when the provider is not configured", async () => {
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => false,
      getUnavailableReason: () => "Admin AI is not configured yet.",
      generate: vi.fn(),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "What do we know?",
      contactId: CONTACT_ID,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not configured/i);
    expect(retrievalMod.retrieveConversationEvidence).not.toHaveBeenCalled();
  });

  it("discloses chat retrieval degradation while still answering from CRM card evidence", async () => {
    enableEvidence();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockRejectedValue(
      new Error("embeddings unavailable"),
    );
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          uncertainty: [],
          shortlist: [
            {
              contactId: CONTACT_ID,
              contactName: "Marina Costa",
              whyFit: ["Grounded in application"],
              concerns: [],
              citations: [
                {
                  evidenceId: "e1",
                  claimKey: "shortlist.0.whyFit.0",
                },
              ],
            },
          ],
        } as AdminAiResponse,
        modelMetadata: {},
      }),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "Find candidates",
    });

    expect(result.status).toBe("complete");
    expect(result.response?.uncertainty).toContain(
      "Conversation evidence retrieval was unavailable for this answer.",
    );
    expect(result.modelMetadata?.rawCards).toEqual(
      expect.objectContaining({
        chatRetrievalUnavailable: true,
      }),
    );
  });

  it("drops unknown citation ids from persisted contact responses", async () => {
    enableEvidence();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          uncertainty: [],
          contactAssessment: {
            inferredQualities: ["Grounded", "Foreign"],
            concerns: [],
            citations: [
              {
                evidenceId: "[e1]",
                claimKey: "contactAssessment.inferredQualities.0",
              },
              {
                evidenceId: "ghost",
                claimKey: "contactAssessment.inferredQualities.1",
              },
            ],
          },
        } as AdminAiResponse,
        modelMetadata: {},
      }),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "What?",
      contactId: CONTACT_ID,
    });

    expect(result.response?.contactAssessment?.citations).toEqual([
      {
        evidenceId: makeEvidence().evidenceId,
        claimKey: "contactAssessment.inferredQualities.0",
      },
    ]);
    expect(result.modelMetadata?.droppedEvidenceIds).toEqual(["ghost"]);
  });

  it("returns visible insufficient evidence when a contact assessment has no resolved citations", async () => {
    enableEvidence();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    const retrievalMod = await import("@/lib/conversations/retrieval");

    vi.mocked(cardDataMod.loadContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(retrievalMod.retrieveConversationEvidence).mockResolvedValue([]);
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: {
          uncertainty: [],
          contactAssessment: {
            inferredQualities: ["Ungrounded"],
            concerns: [],
            citations: [
              {
                evidenceId: "ghost",
                claimKey: "contactAssessment.inferredQualities.0",
              },
            ],
          },
        } as AdminAiResponse,
        modelMetadata: {},
      }),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });
    vi.mocked(dataMod.createAdminAiCitations).mockResolvedValue();

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "contact",
      threadId: "thread-1",
      question: "What?",
      contactId: CONTACT_ID,
    });

    expect(result.status).toBe("complete");
    expect(result.response?.contactAssessment).toBeUndefined();
    expect(result.response?.uncertainty).toContain(
      "The model returned a contact assessment, but its citations could not be resolved to raw evidence, so no grounded assessment could be kept.",
    );
    expect(result.modelMetadata).toEqual({
      source: "system",
      reason: "ungrounded_raw_card_contact_assessment",
    });
    expect(dataMod.createAdminAiCitations).not.toHaveBeenCalled();
  });
});

describe("runAdminAiAnalysis (map-reduce scan)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("synthesizes over ONLY the candidate cards the map stage surfaced", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("map_reduce");
    // >30 records so the map stage runs (small corpora are skipped).
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
      ...makeFillerRecords(34),
    ]);

    const completeJson = vi.fn().mockResolvedValue({
      json: {
        candidates: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            evidenceSummary: "Call note: has her own project in mind.",
          },
        ],
      },
      modelMetadata: { provider: "deepseek", usage: { completion_tokens: 5 } },
    });
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["Fit"],
            concerns: [],
            citations: [],
          },
        ],
      } as AdminAiResponse,
      modelMetadata: { model: "deepseek-v4-pro" },
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
      completeJson,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who has their own projects in mind?",
    });

    expect(result.status).toBe("complete");
    expect(completeJson).toHaveBeenCalled();

    const generateArg = generate.mock.calls[0]![0] as {
      cards: Array<{ contactId: string }>;
      promptCacheKey: unknown;
    };
    expect(generateArg.cards.map((c) => c.contactId)).toEqual([CONTACT_ID]);
    expect(generateArg.promptCacheKey).toBeNull();

    const persisted = vi.mocked(dataMod.createAdminAiMessage).mock
      .calls[0]![0] as { modelMetadata: { scan?: { mode?: string } } };
    expect(persisted.modelMetadata.scan?.mode).toBe("map_reduce");
  });

  it("returns an insufficient response when the scan finds no candidates", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("map_reduce");
    // 35 records so the map stage runs and can return zero candidates.
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue(
      makeFillerRecords(35),
    );
    const generate = vi.fn();
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
      completeJson: vi.fn().mockResolvedValue({
        json: { candidates: [] },
        modelMetadata: { provider: "deepseek", usage: null },
      }),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who has their own projects in mind?",
    });

    expect(result.status).toBe("complete");
    expect(generate).not.toHaveBeenCalled();
    expect(result.modelMetadata).toEqual({
      source: "system",
      reason: "map_scan_no_candidates",
    });
    expect(
      result.response?.uncertainty.some((u) =>
        u.includes("A full chunked scan of all 35 eligible contacts"),
      ),
    ).toBe(true);
  });

  it("skips the map stage when the corpus fits in one chunk", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("map_reduce");
    // 2 records (<= MAP_CHUNK_SIZE) — the map stage is skipped, reduce sees all.
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
      makeRecord(OTHER_CONTACT_ID),
    ]);
    // completeJson serves the planner (empty plan → no-op) then would serve the
    // map stage — which is skipped here, so it is called exactly once (planner).
    const completeJson = vi.fn().mockResolvedValue({
      json: { tagConstraint: null, budgetMin: null, fieldConstraints: [], notes: "" },
      modelMetadata: {},
    });
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["Fit"],
            concerns: [],
            citations: [],
          },
        ],
      } as AdminAiResponse,
      modelMetadata: { model: "deepseek-v4-pro" },
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
      completeJson,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who has their own projects in mind?",
    });

    // Called once for the planner; the map stage was skipped (would add calls).
    expect(completeJson).toHaveBeenCalledTimes(1);
    const generateArg = generate.mock.calls[0]![0] as {
      cards: Array<{ contactId: string }>;
      promptCacheKey: unknown;
    };
    expect(generateArg.cards.map((c) => c.contactId).sort()).toEqual(
      [CONTACT_ID, OTHER_CONTACT_ID].sort(),
    );
    // map_reduce mode still suppresses the shared global prompt-cache key.
    expect(generateArg.promptCacheKey).toBeNull();
  });

  it("throws and persists a failed message when the provider lacks completeJson", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("map_reduce");
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeRecord(CONTACT_ID),
    ]);
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn(),
      // No completeJson — an OpenAI-style provider cannot run the map scan.
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({
      id: "assistant-failed",
    });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    await expect(
      runAdminAiAnalysis({
        scope: "global",
        threadId: "thread-1",
        question: "who has their own projects in mind?",
      }),
    ).rejects.toThrow(/requires ADMIN_AI_PROVIDER=deepseek/);

    expect(dataMod.createAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });
});

describe("describeAssistantResponse", () => {
  it("summarizes shortlist size plus additional-match totals", async () => {
    const { describeAssistantResponse } = await import("./orchestrator");
    const summary = describeAssistantResponse({
      assumptions: [],
      shortlist: Array.from({ length: 10 }, (_, i) => ({
        contactId: `id-${i}`,
        contactName: `C${i}`,
        whyFit: [],
        concerns: [],
        citations: [],
      })),
      additionalMatches: Array.from({ length: 23 }, (_, i) => ({
        contactId: `a-${i}`,
        contactName: `A${i}`,
        reason: "meets bar",
      })),
      uncertainty: [],
    });

    expect(summary).toBe(
      "Shortlisted 10 contacts (+23 more matches): C0, C1, C2, +7 more.",
    );
  });
});

describe("runAdminAiAnalysis (ranking + tag prefilter)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sorts the shortlist by matchStrength and overflows past 10 into additionalMatches", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    // 12 entries with deliberately unsorted matchStrength (model emitted them
    // out of order — code must enforce ranking + the 10-entry cap). Each has a
    // matching corpus record so the id-integrity repair keeps them all.
    const strengths = [30, 90, 10, 80, 50, 70, 40, 100, 20, 60, 5, 85];
    const entryId = (i: number) =>
      `${String(i).padStart(8, "0")}-3333-4333-8333-333333333333`;
    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue(
      strengths.map((s, i) => {
        const base = makeRecord(entryId(i));
        return { ...base, contact: { ...base.contact, name: `C${s}` } };
      }),
    );

    const shortlist = strengths.map((s, i) => ({
      contactId: entryId(i),
      contactName: `C${s}`,
      whyFit: [`why ${s}`],
      concerns: [],
      citations: [],
      matchStrength: s,
    }));
    const generate = vi.fn().mockResolvedValue({
      response: { uncertainty: [], shortlist } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who fits?",
    });

    expect(result.response?.shortlist?.map((e) => e.matchStrength)).toEqual([
      100, 90, 85, 80, 70, 60, 50, 40, 30, 20,
    ]);
    expect(result.response?.shortlist?.length).toBe(10);
    expect(
      result.response?.additionalMatches?.map((m) => m.matchStrength),
    ).toEqual([10, 5]);
  });

  it("prefilters to a named tag cohort and discloses the excluded contacts", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeTaggedRecord(CONTACT_ID, "26 Coral Catch"),
      makeTaggedRecord(OTHER_CONTACT_ID, "Some Other Cohort 2027"),
    ]);
    const generate = vi.fn().mockResolvedValue({
      response: { uncertainty: [], shortlist: [] } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who is a potential candidate for 26 Coral Catch?",
    });

    const generateArg = generate.mock.calls[0]![0] as {
      cards: Array<{ contactId: string }>;
    };
    expect(generateArg.cards.map((c) => c.contactId)).toEqual([CONTACT_ID]);
    expect(
      result.response?.uncertainty.some((u) =>
        u.includes("carry no '26 Coral Catch' tag"),
      ),
    ).toBe(true);
  });

  it("excludes a declined-only cohort member and discloses the reason", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeTaggedRecord(CONTACT_ID, "26 Coral Catch", "Interested"),
      makeTaggedRecord(OTHER_CONTACT_ID, "26 Coral Catch", "Declined"),
    ]);
    const generate = vi.fn().mockResolvedValue({
      response: { uncertainty: [], shortlist: [] } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who is a potential candidate for 26 Coral Catch?",
    });

    // The declined-only member was not sent to synthesis.
    const generateArg = generate.mock.calls[0]![0] as {
      cards: Array<{ contactId: string }>;
    };
    expect(generateArg.cards.map((c) => c.contactId)).toEqual([CONTACT_ID]);
    expect(
      result.response?.uncertainty.some((u) =>
        u.includes("their only '26 Coral Catch' tag is 'Declined'"),
      ),
    ).toBe(true);
  });
});

describe("runAdminAiAnalysis (constraint planner)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("applies a planned tag constraint end-to-end and populates structuredFilters", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeTaggedRecord(CONTACT_ID, "26 Coral Catch", "Interested"),
      makeTaggedRecord(OTHER_CONTACT_ID, "26 Coral Catch", "Declined"),
    ]);
    const completeJson = vi.fn().mockResolvedValue({
      json: {
        tagConstraint: {
          category: "26 Coral Catch",
          includeStatuses: ["Interested"],
        },
        budgetMin: null,
        fieldConstraints: [],
        notes: "cohort",
      },
      modelMetadata: {},
    });
    const generate = vi.fn().mockResolvedValue({
      response: { uncertainty: [], shortlist: [] } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
      completeJson,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who is interested in 26 Coral Catch?",
    });

    const generateArg = generate.mock.calls[0]![0] as {
      cards: Array<{ contactId: string }>;
      queryPlan: { structuredFilters: unknown[] };
    };
    // Only the Interested cohort member reached synthesis; the Declined one was
    // dropped by the planned constraint.
    expect(generateArg.cards.map((c) => c.contactId)).toEqual([CONTACT_ID]);
    expect(generateArg.queryPlan.structuredFilters).toEqual([
      { field: "26 Coral Catch", op: "in", value: ["Interested"] },
    ]);

    const persisted = vi.mocked(dataMod.createAdminAiMessage).mock
      .calls[0]![0] as { modelMetadata: { planner?: unknown } };
    expect(persisted.modelMetadata.planner).toBeDefined();
  });

  it("falls back to legacy filters with a disclosed note when the planner fails", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeTaggedRecord(CONTACT_ID, "26 Coral Catch", "Interested"),
      makeTaggedRecord(OTHER_CONTACT_ID, "26 Coral Catch", "Declined"),
    ]);
    const generate = vi.fn().mockResolvedValue({
      response: { uncertainty: [], shortlist: [] } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
      completeJson: vi.fn().mockRejectedValue(new Error("planner down")),
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    const result = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who is interested in 26 Coral Catch?",
    });

    expect(result.response?.uncertainty).toContain(
      "AI constraint planning was unavailable for this answer; only basic deterministic filters were applied.",
    );
    // Legacy tag filter still applied: the Declined-only member was dropped.
    const generateArg = generate.mock.calls[0]![0] as {
      cards: Array<{ contactId: string }>;
    };
    expect(generateArg.cards.map((c) => c.contactId)).toEqual([CONTACT_ID]);
  });

  async function runEnumerationCase(enumerationOnly: boolean) {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");

    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");
    // 3 prefiltered Interested members.
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue([
      makeTaggedRecord(CONTACT_ID, "26 Coral Catch", "Interested"),
      makeTaggedRecord(OTHER_CONTACT_ID, "26 Coral Catch", "Interested"),
      makeTaggedRecord(MISSING_BUDGET_CONTACT_ID, "26 Coral Catch", "Interested"),
    ]);
    const completeJson = vi.fn().mockResolvedValue({
      json: {
        tagConstraint: { category: "26 Coral Catch", includeStatuses: ["Interested"] },
        budgetMin: null,
        fieldConstraints: [],
        enumerationOnly,
        notes: "",
      },
      modelMetadata: {},
    });
    // Reduce returns only 2 of the 3 prefiltered members.
    const generate = vi.fn().mockResolvedValue({
      response: {
        uncertainty: [],
        shortlist: [
          {
            contactId: CONTACT_ID,
            contactName: "Marina Costa",
            whyFit: ["fit"],
            concerns: [],
            citations: [],
            matchStrength: 90,
          },
          {
            contactId: OTHER_CONTACT_ID,
            contactName: "Ivo Santos",
            whyFit: ["fit"],
            concerns: [],
            citations: [],
            matchStrength: 80,
          },
        ],
      } as AdminAiResponse,
      modelMetadata: {},
    });
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue({
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate,
      completeJson,
    });
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis } = await import("./orchestrator");
    return runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who is interested in 26 Coral Catch?",
    });
  }

  it("appends prefiltered members the reduce dropped when enumerationOnly is true", async () => {
    const result = await runEnumerationCase(true);
    const appended = result.response?.additionalMatches?.find(
      (m) => m.contactId === MISSING_BUDGET_CONTACT_ID,
    );
    expect(appended?.reason).toBe("Carries '26 Coral Catch: Interested' tag");
    expect(appended?.matchStrength).toBe(1);
  });

  it("does not append missing members when enumerationOnly is false", async () => {
    const result = await runEnumerationCase(false);
    const union = new Set([
      ...(result.response?.shortlist ?? []).map((e) => e.contactId),
      ...(result.response?.additionalMatches ?? []).map((m) => m.contactId),
    ]);
    expect(union.has(MISSING_BUDGET_CONTACT_ID)).toBe(false);
  });
});

describe("runGlobalSynthesis (id integrity + drift-proof)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function namedRecord(id: string, name: string): ContactCardRecord {
    const base = makeRecord(id);
    return { ...base, contact: { ...base.contact, name } };
  }

  const GARBLED_RESPONSE = {
    assumptions: [],
    uncertainty: [],
    shortlist: [
      {
        contactId: "garbled-xxxx",
        contactName: "Marina Costa",
        whyFit: ["fit"],
        concerns: [],
        citations: [],
        matchStrength: 90,
      },
      {
        contactId: "no-such-id",
        contactName: "Nobody Here",
        whyFit: ["fit"],
        concerns: [],
        citations: [],
        matchStrength: 50,
      },
      {
        contactId: OTHER_CONTACT_ID,
        contactName: "Ivo Santos",
        whyFit: ["fit"],
        concerns: [],
        citations: [],
        matchStrength: 80,
      },
    ],
  };

  function makeProviderReturning() {
    return {
      isConfigured: () => true,
      getUnavailableReason: () => null,
      generate: vi.fn().mockResolvedValue({
        response: structuredClone(GARBLED_RESPONSE) as AdminAiResponse,
        modelMetadata: {},
      }),
    };
  }

  const RECORDS = () => [
    namedRecord(CONTACT_ID, "Marina Costa"),
    namedRecord(OTHER_CONTACT_ID, "Ivo Santos"),
  ];

  it("repairs a garbled id by unique name and drops an unresolvable one", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");

    const { runGlobalSynthesis } = await import("./orchestrator");
    const result = await runGlobalSynthesis({
      provider: makeProviderReturning() as never,
      records: RECORDS(),
      question: "who fits?",
      queryPlan: {
        mode: "global_search",
        structuredFilters: [],
        textFocus: ["fits"],
        requestedLimit: 10,
      },
      includeEvidence: false,
    });

    expect(result.status).toBe("complete");
    // garbled-xxxx → CONTACT_ID (unique name); no-such-id dropped; OTHER kept.
    expect(result.response.shortlist?.map((e) => e.contactId)).toEqual([
      CONTACT_ID,
      OTHER_CONTACT_ID,
    ]);
    expect(result.diagnostics.idRepairs).toBe(1);
    expect(result.diagnostics.idDrops).toBe(1);
    expect(
      result.response.uncertainty.some((u) =>
        u.includes("unresolvable contact references"),
      ),
    ).toBe(true);
  });

  it("produces identical post-processing from the orchestrator and a direct call (no drift)", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    const providerMod = await import("./provider");
    const dataMod = await import("@/lib/data/admin-ai");
    const cardDataMod = await import("@/lib/data/contact-cards");
    vi.mocked(providerMod.getAdminAiScanMode).mockReturnValue("single");

    const orchestratorProvider = makeProviderReturning();
    vi.mocked(providerMod.getAdminAiProvider).mockReturnValue(
      orchestratorProvider as never,
    );
    vi.mocked(cardDataMod.loadEligibleContactCardRecords).mockResolvedValue(RECORDS());
    vi.mocked(dataMod.createAdminAiMessage).mockResolvedValue({ id: "assistant-1" });

    const { runAdminAiAnalysis, runGlobalSynthesis } = await import("./orchestrator");
    const viaOrchestrator = await runAdminAiAnalysis({
      scope: "global",
      threadId: "thread-1",
      question: "who fits?",
    });
    const direct = await runGlobalSynthesis({
      provider: makeProviderReturning() as never,
      records: RECORDS(),
      question: "who fits?",
      queryPlan: {
        mode: "global_search",
        structuredFilters: [],
        textFocus: ["fits"],
        requestedLimit: 10,
      },
      includeEvidence: false,
    });

    expect(viaOrchestrator.response?.shortlist?.map((e) => e.contactId)).toEqual(
      direct.response.shortlist?.map((e) => e.contactId),
    );
    expect(viaOrchestrator.response?.shortlist?.map((e) => e.matchStrength)).toEqual(
      direct.response.shortlist?.map((e) => e.matchStrength),
    );
  });
});
