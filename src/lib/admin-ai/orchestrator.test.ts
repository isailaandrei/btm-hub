import { beforeEach, describe, expect, it, vi } from "vitest";
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

function makeRecord(contactId = CONTACT_ID): ContactCardRecord {
  return {
    contact: {
      id: contactId,
      name: contactId === CONTACT_ID ? "Marina Costa" : "Ivo Santos",
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
        answers: { ultimate_vision: "I want to film ocean conservation stories." },
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

describe("runAdminAiAnalysis (raw cards)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("runs global analysis over rendered eligible contact cards and persists grounded citations", async () => {
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
                evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
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
        ]),
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
          }),
          expect.objectContaining({
            evidenceId: "whatsapp_message:message-1",
          }),
        ]),
        promptCacheKey: expect.stringMatching(/^admin-ai-cards:/),
      }),
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

  it("drops unsupported global shortlist entries after citation guardrails", async () => {
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
                  evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
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
                  evidenceId: "missing-evidence",
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
  });

  it("runs contact analysis over one rendered contact card", async () => {
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
              evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
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
        cards: [expect.objectContaining({ contactId: CONTACT_ID })],
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

  it("drops unknown citation ids from persisted contact responses", async () => {
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
                evidenceId: makeEvidence().evidenceId,
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
});
