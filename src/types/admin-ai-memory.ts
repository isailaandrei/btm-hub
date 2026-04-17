/**
 * Shared types for the admin AI memory subsystem (Phase 1).
 *
 * These types mirror the row shapes defined by
 * `supabase/migrations/20260416000001_admin_ai_memory_foundation.sql` and
 * the structured-output contract used by the dossier generator.
 *
 * Source-type names are unified across current CRM sources and future
 * connectors so the answer layer never needs source-specific branches.
 */

// ---------------------------------------------------------------------------
// Source / chunk types
// ---------------------------------------------------------------------------

export type CrmAiChunkSourceType =
  | "application_answer"
  | "contact_note"
  | "application_admin_note"
  | "whatsapp_message"
  | "instagram_message"
  | "zoom_transcript_chunk";

/**
 * Row shape returned from `crm_ai_evidence_chunks` (snake_case to match the
 * table). Callers that need the camelCase API should map at the boundary.
 */
export type CrmAiEvidenceChunk = {
  id: string;
  contact_id: string;
  application_id: string | null;
  source_type: CrmAiChunkSourceType;
  source_id: string;
  source_timestamp: string | null;
  text: string;
  metadata_json: Record<string, unknown>;
  content_hash: string;
  chunk_version: number;
  created_at: string;
  updated_at: string;
};

/**
 * Camel-cased input used by callers that build chunks before persisting.
 * Maps directly to a `crm_ai_evidence_chunks` row.
 */
export type CrmAiEvidenceChunkInput = {
  contactId: string;
  applicationId: string | null;
  sourceType: CrmAiChunkSourceType;
  sourceId: string;
  sourceTimestamp: string | null;
  text: string;
  metadata: Record<string, unknown>;
  contentHash: string;
  chunkVersion: number;
};

// ---------------------------------------------------------------------------
// Dossier types
// ---------------------------------------------------------------------------

export type DossierConfidence = "high" | "medium" | "low";

export type DossierSignalEntry = {
  value: string;
  confidence: DossierConfidence;
};

export type DossierSourceCoverage = {
  applicationCount: number;
  contactNoteCount: number;
  applicationAdminNoteCount: number;
  whatsappMessageCount: number;
  instagramMessageCount: number;
  zoomChunkCount: number;
};

export type DossierEvidenceAnchor = {
  claim: string;
  chunkIds: string[];
  confidence: DossierConfidence;
};

export type DossierSignals = {
  motivation: DossierSignalEntry[];
  communicationStyle: DossierSignalEntry[];
  reliabilitySignals: DossierSignalEntry[];
  fitSignals: DossierSignalEntry[];
  concerns: DossierSignalEntry[];
};

/**
 * Row shape from `crm_ai_contact_dossiers`.
 */
export type CrmAiContactDossier = {
  contact_id: string;
  dossier_version: number;
  generator_version: string;
  source_fingerprint: string;
  source_coverage: DossierSourceCoverage;
  facts_json: Record<string, unknown>;
  signals_json: DossierSignals;
  contradictions_json: string[];
  unknowns_json: string[];
  evidence_anchors_json: DossierEvidenceAnchor[];
  short_summary: string;
  medium_summary: string;
  confidence_json: Record<string, DossierConfidence | string>;
  last_built_at: string;
  stale_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmAiContactDossierState = Pick<
  CrmAiContactDossier,
  | "contact_id"
  | "dossier_version"
  | "generator_version"
  | "source_fingerprint"
  | "stale_at"
  | "last_built_at"
>;

/**
 * Camel-cased input used by callers that build dossiers before persisting.
 */
export type CrmAiContactDossierInput = {
  contactId: string;
  dossierVersion: number;
  generatorVersion: string;
  sourceFingerprint: string;
  sourceCoverage: DossierSourceCoverage;
  facts: Record<string, unknown>;
  signals: DossierSignals;
  contradictions: string[];
  unknowns: string[];
  evidenceAnchors: DossierEvidenceAnchor[];
  shortSummary: string;
  mediumSummary: string;
  confidence: Record<string, DossierConfidence | string>;
  staleAt: string | null;
};

// ---------------------------------------------------------------------------
// Ranking card types
// ---------------------------------------------------------------------------

/**
 * Compact raw admin-authored note carried on the ranking card.
 *
 * Produced deterministically (no AI) so admin tag/note workflows stay
 * free and the ranker gets fresh high-signal text without waiting on a
 * dossier rebuild.
 */
export type AdminNoteRecent = {
  /** Which source this note came from. */
  kind: "contact_note" | "application_admin_note";
  /** Raw admin text, truncated to a reasonable cap (ellipsis on truncation). */
  text: string;
  /** Author display name as recorded on the note. */
  authorName: string | null;
  /** ISO timestamp. Used for ordering; admins typically read newest-first. */
  createdAt: string;
  /** Populated for application admin notes so the UI can link back. */
  applicationId?: string;
};

/**
 * Row shape from `crm_ai_contact_ranking_cards`.
 */
export type CrmAiContactRankingCard = {
  contact_id: string;
  dossier_version: number;
  source_fingerprint: string;
  facts_json: Record<string, unknown>;
  top_fit_signals_json: DossierSignalEntry[];
  top_concerns_json: DossierSignalEntry[];
  confidence_notes_json: string[];
  short_summary: string;
  /**
   * Top-N raw admin-authored notes carried on the ranking card.
   * Optional because the column was added in migration
   * `20260417000001_admin_ai_ranking_card_admin_notes_recent.sql` —
   * rows persisted before that migration won't have it, and test
   * fixtures can omit it. Consumers should treat `undefined` as `[]`.
   */
  admin_notes_recent_json?: AdminNoteRecent[];
  updated_at: string;
  /**
   * EPHEMERAL — populated by `assembleGlobalCohortMemory` at query time,
   * NEVER persisted. Top FTS hits from `crm_ai_evidence_chunks` for the
   * current question's text focus, keyed to this contact. Gives the
   * ranker a raw-text shortcut so keyword-specific queries (e.g. "who
   * mentioned National Geographic") surface contacts whose dossier
   * summaries dropped the literal keyword during compression.
   */
  queryMatchingChunks?: QueryMatchingChunk[];
};

export type QueryMatchingChunk = {
  /** Raw chunk text, truncated. */
  text: string;
  /** Origin label (`ultimate_vision`, `Contact note (…)`, etc.). */
  sourceLabel: string;
  /** Which source produced this chunk. */
  sourceType: string;
};

export type CrmAiContactRankingCardInput = {
  contactId: string;
  dossierVersion: number;
  sourceFingerprint: string;
  facts: Record<string, unknown>;
  topFitSignals: DossierSignalEntry[];
  topConcerns: DossierSignalEntry[];
  confidenceNotes: string[];
  shortSummary: string;
  /** Optional — defaults to `[]` if the builder isn't given a notes surface. */
  adminNotesRecent?: AdminNoteRecent[];
};

// ---------------------------------------------------------------------------
// Embedding types (schema only — retrieval not active in current CRM path)
// ---------------------------------------------------------------------------

export type CrmAiEmbeddingTargetType = "chunk" | "dossier";

export type CrmAiEmbeddingRow = {
  id: string;
  target_type: CrmAiEmbeddingTargetType;
  target_id: string;
  embedding_model: string;
  embedding_version: string;
  content_hash: string;
  embedding: number[] | null;
  created_at: string;
};
