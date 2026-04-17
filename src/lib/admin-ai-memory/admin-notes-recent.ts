/**
 * Compact projection of admin-authored notes for the ranking card.
 *
 * Merges application admin notes + contact notes into a single
 * newest-first list, capped on count and per-note length. Produced
 * deterministically on every write that touches admin notes so the
 * ranking pass gets a fresh high-signal surface without waiting on a
 * dossier rebuild.
 */

import type { AdminNote, Application, ContactNote } from "@/types/database";
import type { AdminNoteRecent } from "@/types/admin-ai-memory";

export const ADMIN_NOTES_RECENT_LIMIT = 5;
export const ADMIN_NOTES_RECENT_MAX_CHARS = 400;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}\u2026`;
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type BuildAdminNotesRecentInput = {
  applications: Application[];
  contactNotes: ContactNote[];
  limit?: number;
  maxChars?: number;
};

export function buildAdminNotesRecent(
  input: BuildAdminNotesRecentInput,
): AdminNoteRecent[] {
  const limit = input.limit ?? ADMIN_NOTES_RECENT_LIMIT;
  const maxChars = input.maxChars ?? ADMIN_NOTES_RECENT_MAX_CHARS;

  const merged: AdminNoteRecent[] = [];

  for (const note of input.contactNotes) {
    if (!isNonBlank(note.text)) continue;
    merged.push({
      kind: "contact_note",
      text: truncate(note.text.trim(), maxChars),
      authorName: note.author_name ?? null,
      createdAt: note.created_at,
    });
  }

  for (const app of input.applications) {
    const adminNotes: AdminNote[] = Array.isArray(app.admin_notes)
      ? app.admin_notes
      : [];
    for (const note of adminNotes) {
      if (!isNonBlank(note.text)) continue;
      const createdAt = note.created_at ?? app.submitted_at;
      merged.push({
        kind: "application_admin_note",
        text: truncate(note.text.trim(), maxChars),
        authorName: note.author_name ?? null,
        createdAt,
        applicationId: app.id,
      });
    }
  }

  merged.sort((a, b) => {
    const aMs = Date.parse(a.createdAt);
    const bMs = Date.parse(b.createdAt);
    const aValid = Number.isFinite(aMs);
    const bValid = Number.isFinite(bMs);
    if (aValid && bValid) return bMs - aMs; // newest first
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });

  return merged.slice(0, limit);
}
