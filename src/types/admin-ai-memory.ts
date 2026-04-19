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
