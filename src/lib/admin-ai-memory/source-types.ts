/**
 * Source-type constants for the admin AI memory subsystem.
 *
 * All AI-facing chunks land in `crm_ai_evidence_chunks` regardless of where
 * they came from. Keeping the source-type vocabulary in one module gives the
 * answer layer one place to switch on provenance without leaking source-
 * specific assumptions into orchestration.
 */

import type { CrmAiChunkSourceType } from "@/types/admin-ai-memory";

export const CHUNK_SOURCE_TYPES = {
  applicationAnswer: "application_answer",
  contactNote: "contact_note",
  applicationAdminNote: "application_admin_note",
  whatsappMessage: "whatsapp_message",
  instagramMessage: "instagram_message",
  zoomTranscriptChunk: "zoom_transcript_chunk",
} as const satisfies Record<string, CrmAiChunkSourceType>;

/**
 * Source types we know how to produce in the current implementation.
 * Adding a connector means widening this set and routing it through the
 * chunk builder pipeline.
 */
export const CURRENT_CRM_SOURCE_TYPES: ReadonlySet<CrmAiChunkSourceType> =
  new Set([
    CHUNK_SOURCE_TYPES.applicationAnswer,
    CHUNK_SOURCE_TYPES.contactNote,
    CHUNK_SOURCE_TYPES.applicationAdminNote,
  ]);

export function isCurrentCrmSourceType(value: string): value is CrmAiChunkSourceType {
  return (CURRENT_CRM_SOURCE_TYPES as ReadonlySet<string>).has(value);
}
