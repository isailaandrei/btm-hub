/**
 * Normalize current CRM sources into source-agnostic evidence chunks.
 *
 * Each chunk produced here:
 *   - has a stable `source_id` so re-runs upsert into the same row
 *   - carries a deterministic `content_hash` so unchanged text becomes a no-op
 *   - tags itself with provenance the dossier prompt can cite
 *
 * The text-field allowlist is reused from `src/lib/admin-ai/field-config.ts`
 * so retrieval and chunk generation can never disagree on which application
 * answers are evidence-eligible.
 */

import { createHash } from "crypto";
import { ADMIN_AI_TEXT_FIELDS } from "@/lib/admin-ai/field-config";
import { CHUNK_SOURCE_TYPES } from "./source-types";
import type {
  Application,
  Contact,
  ContactNote,
  AdminNote,
} from "@/types/database";
import type { CrmAiEvidenceChunkInput } from "@/types/admin-ai-memory";

/**
 * Schema/version of the chunk shape this builder emits. Bump when the chunk
 * payload changes in a way that should invalidate persisted rows.
 */
export const CHUNK_BUILDER_VERSION = 1;

function hashContent(parts: Array<string | null | undefined>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\u0001");
  }
  return hash.digest("hex");
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildAdminNoteSourceId(
  applicationId: string,
  note: Pick<AdminNote, "author_id" | "created_at">,
  index: number,
): string {
  // Stable identity first: when either author_id or created_at is
  // present, use them — the sourceId then survives array reordering.
  // When both are missing the hash degenerates to `applicationId +
  // "" + ""`, so two such notes on the same application would collide
  // and silently overwrite each other on upsert. Falling back to the
  // array index as a tiebreaker restores uniqueness for that edge
  // case without disturbing stable ids for well-formed notes.
  const parts: Array<string | null | undefined> = [
    applicationId,
    note.author_id,
    note.created_at,
  ];
  if (note.author_id == null && note.created_at == null) {
    parts.push(String(index));
  }
  const fingerprint = hashContent(parts).slice(0, 16);
  return `${applicationId}:an:${fingerprint}`;
}

// ---------------------------------------------------------------------------
// Application free-text answers
// ---------------------------------------------------------------------------

export function buildApplicationAnswerChunks(
  application: Application,
): CrmAiEvidenceChunkInput[] {
  if (!application.contact_id) return [];
  const answers = application.answers ?? {};
  const chunks: CrmAiEvidenceChunkInput[] = [];

  for (const field of ADMIN_AI_TEXT_FIELDS) {
    const raw = answers[field];
    if (!isNonBlankString(raw)) continue;
    const text = raw.trim();
    const sourceId = `${application.id}:${field}`;

    chunks.push({
      contactId: application.contact_id,
      applicationId: application.id,
      sourceType: CHUNK_SOURCE_TYPES.applicationAnswer,
      sourceId,
      sourceTimestamp: application.submitted_at ?? null,
      text,
      metadata: {
        sourceLabel: field,
        program: application.program,
      },
      contentHash: hashContent([
        CHUNK_SOURCE_TYPES.applicationAnswer,
        sourceId,
        text,
      ]),
      chunkVersion: CHUNK_BUILDER_VERSION,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Contact notes
// ---------------------------------------------------------------------------

export function buildContactNoteChunks(
  notes: ContactNote[],
): CrmAiEvidenceChunkInput[] {
  const chunks: CrmAiEvidenceChunkInput[] = [];
  for (const note of notes) {
    if (!isNonBlankString(note.text)) continue;
    const text = note.text.trim();
    const sourceId = note.id;

    chunks.push({
      contactId: note.contact_id,
      applicationId: null,
      sourceType: CHUNK_SOURCE_TYPES.contactNote,
      sourceId,
      sourceTimestamp: note.created_at ?? null,
      text,
      metadata: {
        sourceLabel: `Contact note (${note.author_name ?? "admin"})`,
        authorId: note.author_id,
        authorName: note.author_name,
      },
      contentHash: hashContent([
        CHUNK_SOURCE_TYPES.contactNote,
        sourceId,
        text,
      ]),
      chunkVersion: CHUNK_BUILDER_VERSION,
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Application admin notes
//
// The source id must stay stable if another note is removed from the JSONB
// array. Using the positional index would make every later note "move" and
// leave stale chunk rows behind. A created_at/author-derived fingerprint gives
// each note its own durable identity while remaining deterministic across
// rebuilds.
// ---------------------------------------------------------------------------

export function buildApplicationAdminNoteChunks(
  application: Application,
): CrmAiEvidenceChunkInput[] {
  if (!application.contact_id) return [];
  const notes: AdminNote[] = Array.isArray(application.admin_notes)
    ? application.admin_notes
    : [];
  const chunks: CrmAiEvidenceChunkInput[] = [];

  notes.forEach((note, index) => {
    if (!isNonBlankString(note.text)) return;
    const text = note.text.trim();
    const sourceId = buildAdminNoteSourceId(application.id, note, index);

    chunks.push({
      contactId: application.contact_id!,
      applicationId: application.id,
      sourceType: CHUNK_SOURCE_TYPES.applicationAdminNote,
      sourceId,
      sourceTimestamp: note.created_at ?? application.submitted_at ?? null,
      text,
      metadata: {
        sourceLabel: `Admin note (${note.author_name ?? "admin"})`,
        authorId: note.author_id,
        authorName: note.author_name,
        program: application.program,
      },
      contentHash: hashContent([
        CHUNK_SOURCE_TYPES.applicationAdminNote,
        sourceId,
        text,
      ]),
      chunkVersion: CHUNK_BUILDER_VERSION,
    });
  });

  return chunks;
}

// ---------------------------------------------------------------------------
// Top-level aggregator
// ---------------------------------------------------------------------------

export function buildCurrentCrmChunksForContact(input: {
  contact: Contact;
  applications: Application[];
  contactNotes: ContactNote[];
}): CrmAiEvidenceChunkInput[] {
  // Contact-scoped — applications passed in MUST already be filtered to the
  // target contact. We still defensively filter to avoid misuse leaking
  // foreign-contact chunks into this contact's memory.
  const ownedApplications = input.applications.filter(
    (a) => a.contact_id === input.contact.id,
  );
  const ownedNotes = input.contactNotes.filter(
    (n) => n.contact_id === input.contact.id,
  );

  const chunks: CrmAiEvidenceChunkInput[] = [];
  for (const app of ownedApplications) {
    chunks.push(...buildApplicationAnswerChunks(app));
    chunks.push(...buildApplicationAdminNoteChunks(app));
  }
  chunks.push(...buildContactNoteChunks(ownedNotes));
  return chunks;
}
