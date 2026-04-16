import { describe, it, expect } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import {
  buildApplicationAnswerChunks,
  buildApplicationAdminNoteChunks,
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
      expect(c.sourceId).toBe(`${APP_ID}:${c.metadata.sourceLabel}`);
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

describe("buildApplicationAdminNoteChunks", () => {
  it("emits one chunk per non-blank admin note keyed on application id + index", () => {
    const chunks = buildApplicationAdminNoteChunks(makeApplication());
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sourceId).toBe(`${APP_ID}:an:0`);
    expect(chunks[0]!.sourceType).toBe("application_admin_note");
    expect(chunks[0]!.applicationId).toBe(APP_ID);
    expect(chunks[0]!.text).toBe("Looks like a strong match.");
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
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
    });
    const sourceTypes = new Set(chunks.map((c) => c.sourceType));
    expect(sourceTypes).toContain("application_answer");
    expect(sourceTypes).toContain("contact_note");
    expect(sourceTypes).toContain("application_admin_note");
  });
});
