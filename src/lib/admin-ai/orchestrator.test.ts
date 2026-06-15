import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAiResponse, EvidenceItem } from "@/types/admin-ai";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

vi.mock("./provider", () => ({
  getAdminAiProvider: vi.fn(),
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
          requestedLimit: 25,
        }),
      }),
    );
    expect(result.response?.shortlist?.map((entry) => entry.contactId)).toEqual([
      CONTACT_ID,
    ]);
    expect(result.response?.uncertainty).toContain(
      "Some model-returned shortlist entries were dropped because they were outside deterministic hard filters.",
    );
    expect(result.response?.uncertainty).toContain(
      "2 contacts were excluded by the deterministic budget filter ($6,000 minimum) before synthesis because the available CRM data did not satisfy the user's hard constraint.",
    );
    expect(result.modelMetadata?.hardConstraints).toEqual(
      expect.objectContaining({
        budgetMin: 6000,
        prefilteredContactCount: 2,
        droppedShortlistContactIds: [OTHER_CONTACT_ID],
      }),
    );
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
