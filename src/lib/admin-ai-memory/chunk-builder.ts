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
import {
  ADMIN_AI_TEXT_FIELDS,
  getAdminAiFieldLabel,
  normalizeAdminAiOption,
} from "@/lib/admin-ai/field-config";
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

export type ContactTagChunkSource = {
  tagId: string;
  tagName: string;
  assignedAt: string | null;
};

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

function shortFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function buildVersionedSourceId(logicalSourceId: string, value: unknown): string {
  return `${logicalSourceId}:v:${shortFingerprint(value)}`;
}

function classifySensitivity(fieldKey: string): "sensitive" | "default" {
  return fieldKey === "age" || fieldKey === "gender" ? "sensitive" : "default";
}

function normalizeFieldValue(
  fieldKey: string,
  value: unknown,
): {
  displayValue: string;
  normalizedValue: unknown;
  valueType: "string" | "number" | "boolean" | "multiselect" | "json";
} | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return {
      displayValue: trimmed,
      normalizedValue: normalizeAdminAiOption(fieldKey, trimmed) ?? trimmed,
      valueType: "string",
    };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return {
      displayValue: String(value),
      normalizedValue: value,
      valueType: typeof value === "number" ? "number" : "boolean",
    };
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter((item) => item.length > 0);

    if (normalizedItems.length === 0) return null;

    return {
      displayValue: normalizedItems.join(", "),
      normalizedValue: normalizedItems.map(
        (item) => normalizeAdminAiOption(fieldKey, item) ?? item,
      ),
      valueType: "multiselect",
    };
  }

  if (value == null) return null;

  const json = JSON.stringify(value);
  if (!json || json === "{}" || json === "[]") return null;

  return {
    displayValue: json,
    normalizedValue: value,
    valueType: "json",
  };
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
    const logicalSourceId = `${application.id}:${field}`;
    const sourceId = buildVersionedSourceId(logicalSourceId, text);

    chunks.push({
      contactId: application.contact_id,
      applicationId: application.id,
      sourceType: CHUNK_SOURCE_TYPES.applicationAnswer,
      logicalSourceId,
      sourceId,
      sourceTimestamp: application.submitted_at ?? null,
      text,
      metadata: {
        sourceLabel: field,
        fieldKey: field,
        chunkClass: "free_text_answer",
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
// Application structured fields
// ---------------------------------------------------------------------------

export function buildApplicationStructuredFieldChunks(
  application: Application,
): CrmAiEvidenceChunkInput[] {
  if (!application.contact_id) return [];
  const answers = application.answers ?? {};
  const chunks: CrmAiEvidenceChunkInput[] = [];

  for (const [fieldKey, rawValue] of Object.entries(answers)) {
    if ((ADMIN_AI_TEXT_FIELDS as readonly string[]).includes(fieldKey)) continue;

    const normalized = normalizeFieldValue(fieldKey, rawValue);
    if (!normalized) continue;

    const fieldLabel = getAdminAiFieldLabel(fieldKey);
    const logicalSourceId = `${application.id}:sf:${fieldKey}`;
    const sourceId = buildVersionedSourceId(
      logicalSourceId,
      normalized.normalizedValue,
    );
    const text = `Application field: ${fieldLabel}. Candidate reports ${normalized.displayValue}.`;

    chunks.push({
      contactId: application.contact_id,
      applicationId: application.id,
      sourceType: CHUNK_SOURCE_TYPES.applicationStructuredField,
      logicalSourceId,
      sourceId,
      sourceTimestamp: application.submitted_at ?? null,
      text,
      metadata: {
        sourceLabel: fieldLabel,
        fieldKey,
        fieldLabel,
        displayValue: normalized.displayValue,
        normalizedValue: normalized.normalizedValue,
        valueType: normalized.valueType,
        chunkClass: "structured_field",
        sensitivity: classifySensitivity(fieldKey),
        program: application.program,
      },
      contentHash: hashContent([
        CHUNK_SOURCE_TYPES.applicationStructuredField,
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
      logicalSourceId: sourceId,
      sourceId,
      sourceTimestamp: note.created_at ?? null,
      text,
      metadata: {
        sourceLabel: `Contact note (${note.author_name ?? "admin"})`,
        chunkClass: "contact_note",
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
// Contact tags
// ---------------------------------------------------------------------------

export function buildContactTagChunks(input: {
  contactId: string;
  tags: ContactTagChunkSource[];
}): CrmAiEvidenceChunkInput[] {
  const chunks: CrmAiEvidenceChunkInput[] = [];

  for (const tag of input.tags) {
    const tagName = tag.tagName.trim();
    if (tagName.length === 0) continue;

    const logicalSourceId = `${input.contactId}:tag:${tag.tagId}`;
    const sourceId = buildVersionedSourceId(logicalSourceId, tagName);
    const text = `CRM tag: ${tagName}.`;

    chunks.push({
      contactId: input.contactId,
      applicationId: null,
      sourceType: CHUNK_SOURCE_TYPES.contactTag,
      logicalSourceId,
      sourceId,
      sourceTimestamp: tag.assignedAt,
      text,
      metadata: {
        sourceLabel: "CRM tag",
        chunkClass: "tag",
        tagId: tag.tagId,
        tagName,
      },
      contentHash: hashContent([CHUNK_SOURCE_TYPES.contactTag, sourceId, text]),
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
      logicalSourceId: sourceId,
      sourceId,
      sourceTimestamp: note.created_at ?? application.submitted_at ?? null,
      text,
      metadata: {
        sourceLabel: `Admin note (${note.author_name ?? "admin"})`,
        chunkClass: "application_admin_note",
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
  contactTags?: ContactTagChunkSource[];
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
    chunks.push(...buildApplicationStructuredFieldChunks(app));
    chunks.push(...buildApplicationAdminNoteChunks(app));
  }
  chunks.push(...buildContactNoteChunks(ownedNotes));
  chunks.push(
    ...buildContactTagChunks({
      contactId: input.contact.id,
      tags: input.contactTags ?? [],
    }),
  );
  return chunks;
}
