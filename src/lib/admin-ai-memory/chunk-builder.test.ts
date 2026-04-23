import { describe, it, expect } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import {
  buildApplicationAnswerChunks,
  buildApplicationStructuredFieldChunks,
  buildApplicationAdminNoteChunks,
  buildContactTagChunks,
  buildContactNoteChunks,
  buildCurrentCrmChunksForContact,
} from "./chunk-builder";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: CONTACT_ID,
    email: "joana@example.com",
    name: "Joana",
    phone: null,
    profile_id: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: CONTACT_ID,
    program: "filmmaking",
    status: "reviewing",
    answers: {
      ultimate_vision: "I want to be the voice of the ocean.",
      inspiration_to_apply: "I love the sea.",
      anything_else: "   ",
      questions_or_concerns: "",
    },
    tags: [],
    admin_notes: [
      {
        author_id: "admin-1",
        author_name: "Andrei",
        text: "Looks like a strong match.",
        created_at: "2026-04-15T01:00:00Z",
      },
      {
        author_id: "admin-1",
        author_name: "Andrei",
        text: "   ",
        created_at: "2026-04-15T02:00:00Z",
      },
    ],
    submitted_at: "2026-04-14T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

function makeContactNote(overrides: Partial<ContactNote> = {}): ContactNote {
  return {
    id: "note-1",
    contact_id: CONTACT_ID,
    author_id: "admin-1",
    author_name: "Andrei",
    text: "Met at the dock — passionate about reefs.",
    created_at: "2026-04-15T03:00:00Z",
    ...overrides,
  };
}

describe("buildApplicationAnswerChunks", () => {
  it("emits one chunk per allowlisted text field with non-blank text", () => {
    const chunks = buildApplicationAnswerChunks(makeApplication());
    const labels = chunks.map((c) => c.metadata.sourceLabel as string).sort();
    expect(labels).toEqual(["inspiration_to_apply", "ultimate_vision"]);
    for (const c of chunks) {
      expect(c.contactId).toBe(CONTACT_ID);
      expect(c.applicationId).toBe(APP_ID);
      expect(c.sourceType).toBe("application_answer");
      expect(c.logicalSourceId).toBe(`${APP_ID}:${c.metadata.sourceLabel}`);
      expect(c.sourceId).toMatch(
        new RegExp(`^${APP_ID}:${String(c.metadata.sourceLabel)}:v:`),
      );
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.contentHash).toMatch(/^[a-f0-9]{40,}$/);
    }
  });

  it("ignores blank/whitespace fields", () => {
    const chunks = buildApplicationAnswerChunks(
      makeApplication({
        answers: {
          ultimate_vision: "",
          anything_else: "    ",
        },
      }),
    );
    expect(chunks).toHaveLength(0);
  });

  it("ignores fields not in the admin AI text allowlist", () => {
    const chunks = buildApplicationAnswerChunks(
      makeApplication({
        answers: {
          first_name: "Joana",
          ultimate_vision: "ocean voice",
        },
      }),
    );
    const labels = chunks.map((c) => c.metadata.sourceLabel as string);
    expect(labels).toEqual(["ultimate_vision"]);
  });

  it("returns no chunks when contact_id is missing", () => {
    const chunks = buildApplicationAnswerChunks(
      makeApplication({ contact_id: null }),
    );
    expect(chunks).toEqual([]);
  });

  it("produces a different content_hash when the text changes", () => {
    const a = buildApplicationAnswerChunks(makeApplication());
    const b = buildApplicationAnswerChunks(
      makeApplication({
        answers: {
          ultimate_vision: "I want to be the voice of the ocean!",
          inspiration_to_apply: "I love the sea.",
        },
      }),
    );
    const aVision = a.find((c) => c.metadata.sourceLabel === "ultimate_vision")!;
    const bVision = b.find((c) => c.metadata.sourceLabel === "ultimate_vision")!;
    expect(aVision.contentHash).not.toBe(bVision.contentHash);
  });
});

describe("buildApplicationStructuredFieldChunks", () => {
  it("emits synthetic chunks for non-text application fields with stable logical ids", () => {
    const chunks = buildApplicationStructuredFieldChunks(
      makeApplication({
        answers: {
          budget: "$2,000 - $5,000",
          age: "27",
          gender: "Female",
          languages: ["English", "Spanish"],
          ultimate_vision: "Keep this as free text only.",
        },
      }),
    );

    expect(chunks).toHaveLength(4);
    expect(chunks.map((c) => c.sourceType).every((v) => v === "application_structured_field")).toBe(true);

    const budget = chunks.find((c) => c.metadata.fieldKey === "budget");
    expect(budget).toMatchObject({
      contactId: CONTACT_ID,
      applicationId: APP_ID,
      sourceType: "application_structured_field",
      logicalSourceId: `${APP_ID}:sf:budget`,
    });
    expect(budget?.sourceId).toMatch(new RegExp(`^${APP_ID}:sf:budget:v:`));
    expect(budget?.metadata.displayValue).toBe("$2,000 - $5,000");
    expect(budget?.text).toContain("Budget");
    expect(budget?.text).toContain("$2,000 - $5,000");

    const age = chunks.find((c) => c.metadata.fieldKey === "age");
    expect(age?.metadata.displayValue).toBe("27");
    expect(age?.metadata.normalizedValue).toBe("25-34");
    expect(age?.text).toContain("Age Range");
    expect(age?.text).toContain("27");

    const languages = chunks.find((c) => c.metadata.fieldKey === "languages");
    expect(languages?.metadata.displayValue).toBe("English, Spanish");
    expect(languages?.text).toContain("English");
    expect(languages?.text).toContain("Spanish");

    expect(chunks.find((c) => c.metadata.fieldKey === "ultimate_vision")).toBeUndefined();
  });

  it("falls back to a generic synthetic chunk for fields missing from the registry", () => {
    const chunks = buildApplicationStructuredFieldChunks(
      makeApplication({
        answers: {
          portfolio_url: "https://example.com/work",
        },
      }),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      sourceType: "application_structured_field",
      logicalSourceId: `${APP_ID}:sf:portfolio_url`,
      metadata: expect.objectContaining({
        fieldKey: "portfolio_url",
        fieldLabel: "portfolio_url",
      }),
    });
    expect(chunks[0]?.text).toContain("portfolio_url");
    expect(chunks[0]?.text).toContain("https://example.com/work");
  });

  it("skips blank, null, and empty-array structured values", () => {
    const chunks = buildApplicationStructuredFieldChunks(
      makeApplication({
        answers: {
          budget: "   ",
          languages: [],
          age: null,
          gender: undefined,
        },
      }),
    );
    expect(chunks).toEqual([]);
  });
});

describe("buildContactNoteChunks", () => {
  it("emits one chunk per non-blank note with stable source ids", () => {
    const chunks = buildContactNoteChunks([
      makeContactNote(),
      makeContactNote({ id: "note-2", text: "" }),
      makeContactNote({ id: "note-3", text: "follow up next week" }),
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.sourceId).sort()).toEqual(["note-1", "note-3"]);
    for (const c of chunks) {
      expect(c.sourceType).toBe("contact_note");
      expect(c.applicationId).toBeNull();
      expect(c.contactId).toBe(CONTACT_ID);
    }
  });
});

describe("buildContactTagChunks", () => {
  it("emits one synthetic chunk per assigned tag", () => {
    const chunks = buildContactTagChunks({
      contactId: CONTACT_ID,
      tags: [
        {
          tagId: "tag-1",
          tagName: "Conservation",
          assignedAt: "2026-04-15T04:00:00Z",
        },
        {
          tagId: "tag-2",
          tagName: "National Geographic",
          assignedAt: null,
        },
      ],
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      contactId: CONTACT_ID,
      applicationId: null,
      sourceType: "contact_tag",
      logicalSourceId: `${CONTACT_ID}:tag:tag-1`,
    });
    expect(chunks[0]?.text).toContain("CRM tag");
    expect(chunks[0]?.text).toContain("Conservation");
  });
});

describe("buildApplicationAdminNoteChunks", () => {
  it("emits one chunk per non-blank admin note with a stable source id", () => {
    const chunks = buildApplicationAdminNoteChunks(makeApplication());
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sourceId).toMatch(
      new RegExp(`^${APP_ID}:an:[a-f0-9]{16}$`),
    );
    expect(chunks[0]!.sourceType).toBe("application_admin_note");
    expect(chunks[0]!.applicationId).toBe(APP_ID);
    expect(chunks[0]!.text).toBe("Looks like a strong match.");
  });

  it("keeps the same source id for a surviving admin note when another note is removed", () => {
    const survivingNote = {
      author_id: "admin-2",
      author_name: "Flo",
      text: "Keep this note stable.",
      created_at: "2026-04-15T05:00:00Z",
    };

    const before = buildApplicationAdminNoteChunks(
      makeApplication({
        admin_notes: [
          {
            author_id: "admin-1",
            author_name: "Andrei",
            text: "Delete this note.",
            created_at: "2026-04-15T01:00:00Z",
          },
          survivingNote,
        ],
      }),
    );
    const after = buildApplicationAdminNoteChunks(
      makeApplication({
        admin_notes: [survivingNote],
      }),
    );

    expect(before[1]?.sourceId).toBe(after[0]?.sourceId);
  });

  it("returns no chunks when contact_id is missing", () => {
    const chunks = buildApplicationAdminNoteChunks(
      makeApplication({ contact_id: null }),
    );
    expect(chunks).toEqual([]);
  });
});

describe("buildCurrentCrmChunksForContact", () => {
  it("aggregates all current sources for a contact in one call", () => {
    const chunks = buildCurrentCrmChunksForContact({
      contact: makeContact(),
      applications: [
        makeApplication({
          answers: {
            ultimate_vision: "I want to be the voice of the ocean.",
            budget: "$2,000 - $5,000",
          },
        }),
      ],
      contactNotes: [makeContactNote()],
      contactTags: [
        {
          tagId: "tag-1",
          tagName: "Conservation",
          assignedAt: "2026-04-15T04:00:00Z",
        },
      ],
    });
    const sourceTypes = new Set(chunks.map((c) => c.sourceType));
    expect(sourceTypes).toContain("application_answer");
    expect(sourceTypes).toContain("application_structured_field");
    expect(sourceTypes).toContain("contact_note");
    expect(sourceTypes).toContain("application_admin_note");
    expect(sourceTypes).toContain("contact_tag");
  });
});
