import { describe, expect, it } from "vitest";
import { renderContactCard } from "./contact-card";
import { EvidenceAliasRegistry } from "./evidence-alias";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const TAG_ID = "44444444-4444-4444-8444-444444444444";
const CALL_ID = "55555555-5555-4555-8555-555555555555";

function makeRecord(): ContactCardRecord {
  return {
    contact: {
      id: CONTACT_ID,
      name: "Marina Costa",
      email: "marina@example.com",
      phone: "+351 912 345 678",
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-02T00:00:00Z",
    },
    applications: [
      {
        id: APPLICATION_ID,
        user_id: null,
        contact_id: CONTACT_ID,
        program: "filmmaking",
        status: "reviewing",
        answers: {
          ultimate_vision: "I want to film ocean conservation stories.",
          non_registry_goal: "Build a traveling youth workshop.",
          budget: "$3,000 - $5,000",
        },
        tags: [],
        admin_notes: [
          {
            author_id: "admin-1",
            author_name: "Admin",
            text: "Strong reel, needs scholarship follow-up.",
            created_at: "2026-03-05T00:00:00Z",
          },
        ],
        submitted_at: "2026-03-04T00:00:00Z",
        updated_at: "2026-03-04T00:00:00Z",
      },
    ],
    contactNotes: [
      {
        id: NOTE_ID,
        contact_id: CONTACT_ID,
        author_id: "admin-1",
        author_name: "Admin",
        text: "Prefers WhatsApp.",
        created_at: "2026-03-06T00:00:00Z",
        eventType: "note",
      },
      {
        id: CALL_ID,
        contact_id: CONTACT_ID,
        author_id: "admin-1",
        author_name: "Flo",
        text: "Very interested in the community aspect.",
        created_at: "2026-03-08T00:00:00Z",
        eventType: "call",
      },
    ],
    contactTags: [
      {
        tagId: TAG_ID,
        tagName: "Scholarship",
        categoryName: "26 Coral Catch",
        assignedAt: "2026-03-07T00:00:00Z",
      },
    ],
    conversationFacts: [
      {
        id: "fact-1",
        contactId: CONTACT_ID,
        fieldKey: "budget",
        valueText: "$3-5k",
        source: "whatsapp",
        observedAt: "2026-05-01T00:00:00Z",
        confidence: "medium",
        conflictGroup: "budget",
      },
      {
        id: "fact-2",
        contactId: CONTACT_ID,
        fieldKey: "budget",
        valueText: "~$8k",
        source: "whatsapp",
        observedAt: "2026-05-12T00:00:00Z",
        confidence: "medium",
        conflictGroup: "budget",
      },
    ],
  };
}

describe("renderContactCard", () => {
  it("renders raw CRM data verbatim with registry labels, humanized fallbacks, and stable anchors", () => {
    const card = renderContactCard(makeRecord(), new EvidenceAliasRegistry());

    expect(card.text).toContain("Contact: Marina Costa");
    expect(card.text).toContain("Structured facts: Budget=$3,000 - $5,000 [e1]");
    expect(card.text).not.toContain("Budget: $3,000 - $5,000 [");
    expect(card.text).toContain(
      "Ultimate Vision: I want to film ocean conservation stories. [e3]",
    );
    expect(card.text).toContain(
      "Non registry goal: Build a traveling youth workshop. [e2]",
    );
    expect(card.text).toContain(
      "Admin note: Strong reel, needs scholarship follow-up. [e4]",
    );
    expect(card.text).toContain(
      "Contact note (Admin, 2026-03-06): Prefers WhatsApp. [e7]",
    );
    expect(card.text).toContain(
      "Call note (Flo, 2026-03-08): Very interested in the community aspect. [e8]",
    );
    expect(card.text).toContain("Tags: 26 Coral Catch: Scholarship [e9]");
    expect(card.text).not.toContain("Tag: Scholarship [");
    expect(card.text).not.toContain("[application_answer:");
    expect(card.text).not.toContain("[application_structured_field:");
    expect(card.text).not.toContain("[contact_note:");
    expect(card.text).not.toContain("[contact_tag:");

    expect(card.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceId: `application_answer:${APPLICATION_ID}:ultimate_vision`,
          sourceType: "application_answer",
          sourceId: `${APPLICATION_ID}:ultimate_vision`,
          sourceLabel: "Ultimate Vision",
          text: "I want to film ocean conservation stories.",
        }),
        expect.objectContaining({
          evidenceId: `application_answer:${APPLICATION_ID}:non_registry_goal`,
          sourceLabel: "Non registry goal",
          text: "Build a traveling youth workshop.",
        }),
        expect.objectContaining({
          evidenceId: `contact_note:${CALL_ID}`,
          sourceType: "contact_note",
          sourceId: CALL_ID,
          sourceLabel: "Call note",
          text: "Very interested in the community aspect.",
        }),
      ]),
    );
  });

  it("surfaces conflicting conversation facts instead of resolving them", () => {
    const card = renderContactCard(makeRecord(), new EvidenceAliasRegistry());

    expect(card.text).toContain("Conversation facts");
    expect(card.text).toContain(
      "Budget: $3-5k [e5] (whatsapp 2026-05-01) / ~$8k [e6] (whatsapp 2026-05-12)",
    );
    expect(card.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceId: "conversation_fact:fact-1",
          sourceType: "conversation_fact",
          sourceId: "fact-1",
          text: "$3-5k",
        }),
        expect.objectContaining({
          evidenceId: "conversation_fact:fact-2",
          sourceType: "conversation_fact",
          sourceId: "fact-2",
          text: "~$8k",
        }),
      ]),
    );
  });

  it("co-locates conflicting application answers and conversation facts", () => {
    const card = renderContactCard(makeRecord(), new EvidenceAliasRegistry());

    expect(card.text).toContain("Cross-source signals");
    expect(card.text).toContain(
      "Budget: application 2026-03-04 $3,000 - $5,000 [e1] / whatsapp 2026-05-01 $3-5k [e5] / whatsapp 2026-05-12 ~$8k [e6]",
    );
    expect(card.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceId: `application_structured_field:${APPLICATION_ID}:budget`,
          text: "$3,000 - $5,000",
        }),
        expect.objectContaining({
          evidenceId: "conversation_fact:fact-1",
          text: "$3-5k",
        }),
        expect.objectContaining({
          evidenceId: "conversation_fact:fact-2",
          text: "~$8k",
        }),
      ]),
    );
  });
});
