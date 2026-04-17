import { describe, it, expect } from "vitest";
import { buildAdminNotesRecent } from "./admin-notes-recent";
import type { AdminNote, Application, ContactNote } from "@/types/database";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeContactNote(overrides: Partial<ContactNote> = {}): ContactNote {
  return {
    id: "note-1",
    contact_id: CONTACT_ID,
    author_id: "admin-1",
    author_name: "Andrei",
    text: "Follow up next Tuesday",
    created_at: "2026-04-15T10:00:00Z",
    ...overrides,
  };
}

function makeAdminNote(overrides: Partial<AdminNote> = {}): AdminNote {
  return {
    author_id: "admin-1",
    author_name: "Andrei",
    text: "Looks like a strong match",
    created_at: "2026-04-14T10:00:00Z",
    ...overrides,
  };
}

function makeApplication(adminNotes: AdminNote[]): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: CONTACT_ID,
    program: "filmmaking",
    status: "reviewing",
    answers: {},
    tags: [],
    admin_notes: adminNotes,
    submitted_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
  };
}

describe("buildAdminNotesRecent", () => {
  it("merges contact notes and application admin notes, newest first", () => {
    const result = buildAdminNotesRecent({
      applications: [
        makeApplication([
          makeAdminNote({ text: "Admin note — older", created_at: "2026-04-12T10:00:00Z" }),
        ]),
      ],
      contactNotes: [
        makeContactNote({ text: "Contact note — newer", created_at: "2026-04-16T10:00:00Z" }),
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.text).toBe("Contact note — newer");
    expect(result[0]!.kind).toBe("contact_note");
    expect(result[1]!.text).toBe("Admin note — older");
    expect(result[1]!.kind).toBe("application_admin_note");
  });

  it("caps results at the default limit (5)", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeContactNote({
        id: `note-${i}`,
        text: `Note ${i}`,
        created_at: `2026-04-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    const result = buildAdminNotesRecent({
      applications: [],
      contactNotes: many,
    });
    expect(result).toHaveLength(5);
  });

  it("truncates long note text with an ellipsis", () => {
    const long = "x".repeat(1000);
    const result = buildAdminNotesRecent({
      applications: [],
      contactNotes: [makeContactNote({ text: long })],
      maxChars: 100,
    });
    expect(result[0]!.text.length).toBe(100);
    expect(result[0]!.text.endsWith("\u2026")).toBe(true);
  });

  it("drops blank/whitespace-only notes", () => {
    const result = buildAdminNotesRecent({
      applications: [
        makeApplication([
          makeAdminNote({ text: "   " }),
          makeAdminNote({ text: "real note" }),
        ]),
      ],
      contactNotes: [
        makeContactNote({ text: "" }),
        makeContactNote({ id: "note-2", text: "another real note" }),
      ],
    });
    expect(result.map((r) => r.text).sort()).toEqual([
      "another real note",
      "real note",
    ]);
  });

  it("records applicationId on application admin notes and leaves it undefined on contact notes", () => {
    const result = buildAdminNotesRecent({
      applications: [makeApplication([makeAdminNote()])],
      contactNotes: [makeContactNote()],
    });
    const contactNote = result.find((r) => r.kind === "contact_note")!;
    const adminNote = result.find((r) => r.kind === "application_admin_note")!;
    expect(contactNote.applicationId).toBeUndefined();
    expect(adminNote.applicationId).toBe(APP_ID);
  });

  it("handles missing author gracefully", () => {
    const result = buildAdminNotesRecent({
      applications: [],
      contactNotes: [
        makeContactNote({ author_name: null as unknown as string }),
      ],
    });
    expect(result[0]!.authorName).toBeNull();
  });

  it("falls back to submitted_at when admin note has no created_at", () => {
    const app = makeApplication([
      {
        author_id: "admin-1",
        author_name: "Andrei",
        text: "no timestamp",
        created_at: undefined as unknown as string,
      },
    ]);
    const result = buildAdminNotesRecent({
      applications: [app],
      contactNotes: [],
    });
    expect(result[0]!.createdAt).toBe(app.submitted_at);
  });
});
