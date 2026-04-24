/**
 * Admin AI memory — persistence data layer.
 *
 * Helpers for the current memory tables:
 *   - crm_ai_evidence_chunks
 *   - crm_ai_evidence_subchunks
 *   - crm_ai_fact_observations
 *   - crm_ai_contact_dossiers
 *   - crm_ai_embeddings
 *
 * Every write goes through `requireAdmin()`. Reads use the server-side
 * Supabase client and rely on the RLS policies installed by the migration
 * to gate visibility.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { buildStableChunkId } from "@/lib/admin-ai-memory/chunk-identity";
import type { ContactTagChunkSource } from "@/lib/admin-ai-memory/chunk-builder";
import { CURRENT_CRM_SOURCE_TYPES } from "@/lib/admin-ai-memory/source-types";
import type {
  Application,
  Contact,
  ContactNote,
} from "@/types/database";
import type {
  CrmAiContactDossier,
  CrmAiContactDossierInput,
  CrmAiContactDossierState,
  CrmAiEmbeddingInput,
  CrmAiEvidenceChunkInput,
  CrmAiEvidenceSubchunkInput,
  CrmAiFactObservation,
  CrmAiFactObservationInput,
  DossierSourceCoverage,
} from "@/types/admin-ai-memory";

// ---------------------------------------------------------------------------
// Evidence chunks
// ---------------------------------------------------------------------------

export async function upsertEvidenceChunks(input: {
  chunks: CrmAiEvidenceChunkInput[];
}): Promise<void> {
  if (input.chunks.length === 0) return;
  await requireAdmin();
  const supabase = await createClient();

  const rows = input.chunks.map((c) => ({
    id: buildStableChunkId(c.sourceType, c.sourceId),
    contact_id: c.contactId,
    application_id: c.applicationId,
    source_type: c.sourceType,
    logical_source_id: c.logicalSourceId,
    source_id: c.sourceId,
    source_timestamp: c.sourceTimestamp,
    text: c.text,
    metadata_json: c.metadata,
    content_hash: c.contentHash,
    chunk_version: c.chunkVersion,
    superseded_at: null,
  }));

  const { error } = await supabase
    .from("crm_ai_evidence_chunks")
    .upsert(rows, { onConflict: "source_type,source_id" });

  if (error) {
    throw new Error(`Failed to upsert evidence chunks: ${error.message}`);
  }
}

export async function upsertEvidenceSubchunks(input: {
  subchunks: CrmAiEvidenceSubchunkInput[];
}): Promise<void> {
  if (input.subchunks.length === 0) return;
  await requireAdmin();
  const supabase = await createClient();

  const rows = input.subchunks.map((subchunk) => ({
    id: subchunk.id,
    parent_chunk_id: subchunk.parentChunkId,
    contact_id: subchunk.contactId,
    application_id: subchunk.applicationId,
    subchunk_index: subchunk.subchunkIndex,
    text: subchunk.text,
    content_hash: subchunk.contentHash,
    token_estimate: subchunk.tokenEstimate,
    metadata_json: subchunk.metadata,
  }));

  const { error } = await supabase
    .from("crm_ai_evidence_subchunks")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert evidence subchunks: ${error.message}`);
  }
}

export async function upsertEmbeddings(input: {
  embeddings: CrmAiEmbeddingInput[];
}): Promise<void> {
  if (input.embeddings.length === 0) return;
  await requireAdmin();
  const supabase = await createClient();

  const rows = input.embeddings.map((embedding) => ({
    target_type: embedding.targetType,
    target_id: embedding.targetId,
    embedding_model: embedding.embeddingModel,
    embedding_version: embedding.embeddingVersion,
    content_hash: embedding.contentHash,
    embedding: embedding.embedding,
  }));

  const { error } = await supabase
    .from("crm_ai_embeddings")
    .upsert(rows, {
      onConflict:
        "target_type,target_id,embedding_model,embedding_version,content_hash",
    });

  if (error) {
    throw new Error(`Failed to upsert embeddings: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Fact observations
// ---------------------------------------------------------------------------

const FACT_OBSERVATION_SELECT = [
  "id",
  "contact_id",
  "observation_type",
  "field_key",
  "value_type",
  "value_text",
  "value_json",
  "confidence",
  "source_chunk_ids",
  "source_timestamp",
  "observed_at",
  "invalidated_at",
  "conflict_group",
  "metadata_json",
  "created_at",
].join(", ");

export async function upsertFactObservations(input: {
  observations: CrmAiFactObservationInput[];
}): Promise<void> {
  if (input.observations.length === 0) return;
  await requireAdmin();
  const supabase = await createClient();

  const rows = input.observations.map((observation) => ({
    id: observation.id,
    contact_id: observation.contactId,
    observation_type: observation.observationType,
    field_key: observation.fieldKey,
    value_type: observation.valueType,
    value_text: observation.valueText,
    value_json: observation.valueJson,
    confidence: observation.confidence,
    source_chunk_ids: observation.sourceChunkIds,
    source_timestamp: observation.sourceTimestamp,
    observed_at: observation.observedAt,
    invalidated_at: observation.invalidatedAt,
    conflict_group: observation.conflictGroup,
    metadata_json: observation.metadata,
  }));

  const { error } = await supabase
    .from("crm_ai_fact_observations")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert fact observations: ${error.message}`);
  }
}

export async function listFactObservationsForContact(input: {
  contactId: string;
  includeInvalidated?: boolean;
}): Promise<CrmAiFactObservation[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("crm_ai_fact_observations")
    .select(FACT_OBSERVATION_SELECT)
    .eq("contact_id", input.contactId);

  if (!input.includeInvalidated) {
    query = query.is("invalidated_at", null);
  }

  const { data, error } = await query.order("observed_at", {
    ascending: false,
  });

  if (error) {
    throw new Error(`Failed to list fact observations: ${error.message}`);
  }

  return (data ?? []) as unknown as CrmAiFactObservation[];
}

export async function supersedeStaleCurrentCrmEvidenceChunksForContact(input: {
  contactId: string;
  chunks: CrmAiEvidenceChunkInput[];
}): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const sourceTypes = Array.from(CURRENT_CRM_SOURCE_TYPES);

  const { data, error } = await supabase
    .from("crm_ai_evidence_chunks")
    .select("id, source_type, logical_source_id, source_id, superseded_at")
    .eq("contact_id", input.contactId)
    .in("source_type", sourceTypes)
    .is("superseded_at", null);

  if (error) {
    throw new Error(
      `Failed to load current CRM evidence chunks for superseding: ${error.message}`,
    );
  }

  const currentByLogicalKey = new Map(
    input.chunks.map((chunk) => [
      `${chunk.sourceType}:${chunk.logicalSourceId}`,
      chunk.sourceId,
    ]),
  );

  const currentRows = (data ?? []) as unknown as Array<{
    id: string;
    source_type: string;
    logical_source_id: string;
    source_id: string;
    superseded_at: string | null;
  }>;

  const staleIds = currentRows
    .filter((row) => {
      const nextSourceId = currentByLogicalKey.get(
        `${row.source_type}:${row.logical_source_id}`,
      );
      if (!nextSourceId) return true;
      return nextSourceId !== row.source_id;
    })
    .map((row) => row.id);

  if (staleIds.length === 0) return;

  const { error: updateError } = await supabase
    .from("crm_ai_evidence_chunks")
    .update({
      superseded_at: new Date().toISOString(),
    })
    .in("id", staleIds);

  if (updateError) {
    throw new Error(
      `Failed to supersede stale current CRM evidence chunks: ${updateError.message}`,
    );
  }
}

const CURRENT_CRM_CHUNK_SELECT = [
  "contact_id",
  "application_id",
  "source_type",
  "logical_source_id",
  "source_id",
  "source_timestamp",
  "text",
  "metadata_json",
  "content_hash",
  "chunk_version",
].join(", ");

export async function listCurrentCrmEvidenceChunkInputsForContact(input: {
  contactId: string;
}): Promise<CrmAiEvidenceChunkInput[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_ai_evidence_chunks")
    .select(CURRENT_CRM_CHUNK_SELECT)
    .eq("contact_id", input.contactId)
    .in("source_type", Array.from(CURRENT_CRM_SOURCE_TYPES))
    .is("superseded_at", null)
    .order("source_timestamp", { ascending: true, nullsFirst: true })
    .order("source_type", { ascending: true })
    .order("source_id", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to list current CRM evidence chunks: ${error.message}`,
    );
  }

  const rows = (data ?? []) as unknown as Array<{
    contact_id: string;
    application_id: string | null;
    source_type: CrmAiEvidenceChunkInput["sourceType"];
    logical_source_id: string;
    source_id: string;
    source_timestamp: string | null;
    text: string;
    metadata_json: Record<string, unknown>;
    content_hash: string;
    chunk_version: number;
  }>;

  return rows.map((row) => ({
    contactId: row.contact_id,
    applicationId: row.application_id,
    sourceType: row.source_type,
    logicalSourceId: row.logical_source_id,
    sourceId: row.source_id,
    sourceTimestamp: row.source_timestamp,
    text: row.text,
    metadata: row.metadata_json,
    contentHash: row.content_hash,
    chunkVersion: row.chunk_version,
  }));
}

// ---------------------------------------------------------------------------
// Contact dossiers
// ---------------------------------------------------------------------------

const DOSSIER_SELECT = [
  "contact_id",
  "dossier_version",
  "generator_version",
  "generator_model",
  "source_fingerprint",
  "source_coverage",
  "facts_json",
  "signals_json",
  "contradictions_json",
  "unknowns_json",
  "evidence_anchors_json",
  "short_summary",
  "medium_summary",
  "confidence_json",
  "last_built_at",
  "stale_at",
  "created_at",
  "updated_at",
].join(", ");

export async function upsertContactDossier(
  input: CrmAiContactDossierInput,
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const row = {
    contact_id: input.contactId,
    dossier_version: input.dossierVersion,
    generator_version: input.generatorVersion,
    generator_model: input.generatorModel,
    source_fingerprint: input.sourceFingerprint,
    source_coverage: input.sourceCoverage,
    facts_json: input.facts,
    signals_json: input.signals,
    contradictions_json: input.contradictions,
    unknowns_json: input.unknowns,
    evidence_anchors_json: input.evidenceAnchors,
    short_summary: input.shortSummary,
    medium_summary: input.mediumSummary,
    confidence_json: input.confidence,
    last_built_at: new Date().toISOString(),
    stale_at: input.staleAt,
  };

  const { error } = await supabase
    .from("crm_ai_contact_dossiers")
    .upsert(row, { onConflict: "contact_id" });

  if (error) {
    throw new Error(`Failed to upsert contact dossier: ${error.message}`);
  }
}

export async function getContactDossier(input: {
  contactId: string;
}): Promise<CrmAiContactDossier | null> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_ai_contact_dossiers")
    .select(DOSSIER_SELECT)
    .eq("contact_id", input.contactId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load contact dossier: ${error.message}`);
  }
  if (!data) return null;
  return data as unknown as CrmAiContactDossier;
}

export async function listContactDossiers(input: {
  contactIds: string[];
}): Promise<CrmAiContactDossier[]> {
  if (input.contactIds.length === 0) return [];
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_ai_contact_dossiers")
    .select(DOSSIER_SELECT)
    .in("contact_id", input.contactIds)
    .order("contact_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to list contact dossiers: ${error.message}`);
  }
  return (data ?? []) as unknown as CrmAiContactDossier[];
}

const DOSSIER_STATE_SELECT = [
  "contact_id",
  "dossier_version",
  "generator_version",
  "source_fingerprint",
  "stale_at",
  "last_built_at",
].join(", ");

export async function listContactDossierStates(input: {
  contactIds: string[];
}): Promise<CrmAiContactDossierState[]> {
  if (input.contactIds.length === 0) return [];
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_ai_contact_dossiers")
    .select(DOSSIER_STATE_SELECT)
    .in("contact_id", input.contactIds)
    .order("contact_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to list contact dossier states: ${error.message}`);
  }
  return (data ?? []) as unknown as CrmAiContactDossierState[];
}

// ---------------------------------------------------------------------------
// Partial-patch helpers (no AI)
//
// Used by `refreshContactMemoryFacts` so tag / note mutations can update
// the structural slice of the dossier without rebuilding the interpretive
// fields (signals, summary, anchors — those still come from the AI and
// only refresh on backfill or version drift).
// ---------------------------------------------------------------------------

export async function patchContactDossierStructural(input: {
  contactId: string;
  facts: Record<string, unknown>;
  staleAt?: string | null;
  dossierVersion?: number;
  sourceFingerprint?: string;
  sourceCoverage?: DossierSourceCoverage;
}): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    facts_json: input.facts,
  };
  if ("staleAt" in input) {
    update.stale_at = input.staleAt;
  }
  if (typeof input.dossierVersion === "number") {
    update.dossier_version = input.dossierVersion;
  }
  if (typeof input.sourceFingerprint === "string") {
    update.source_fingerprint = input.sourceFingerprint;
  }
  if (input.sourceCoverage) {
    update.source_coverage = input.sourceCoverage;
  }

  const { error } = await supabase
    .from("crm_ai_contact_dossiers")
    .update(update)
    .eq("contact_id", input.contactId);

  if (error) {
    throw new Error(
      `Failed to patch contact dossier facts: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Source loaders for memory generation
//
// One contact-scoped fetch graph (contact + applications + notes) so the
// chunk builder never reaches through `AdminDataProvider`. Each helper here
// is admin-gated and uses the server-side Supabase client.
// ---------------------------------------------------------------------------

export type ContactCrmSources = {
  contact: Contact;
  applications: Application[];
  contactNotes: ContactNote[];
  contactTags: ContactTagChunkSource[];
};

export async function loadContactCrmSources(input: {
  contactId: string;
}): Promise<ContactCrmSources | null> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: contactData, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", input.contactId)
    .maybeSingle();

  if (contactError) {
    throw new Error(`Failed to load contact: ${contactError.message}`);
  }
  if (!contactData) return null;

  const [
    { data: applicationData, error: applicationError },
    { data: noteData, error: noteError },
    { data: tagData, error: tagError },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("contact_id", input.contactId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("contact_events")
      .select("id, contact_id, author_id, author_name, body, created_at")
      .eq("contact_id", input.contactId)
      .eq("type", "note")
      .neq("body", "")
      .order("created_at", { ascending: true }),
    supabase
      .from("contact_tags")
      .select("tag_id, assigned_at, tags(id, name)")
      .eq("contact_id", input.contactId)
      .order("assigned_at", { ascending: true }),
  ]);

  if (applicationError) {
    throw new Error(
      `Failed to load applications for contact: ${applicationError.message}`,
    );
  }
  if (noteError) {
    throw new Error(
      `Failed to load notes for contact: ${noteError.message}`,
    );
  }
  if (tagError) {
    throw new Error(
      `Failed to load tags for contact: ${tagError.message}`,
    );
  }

  const contactTags = ((tagData ?? []) as unknown as Array<{
    tag_id: string;
    assigned_at: string | null;
    tags: Array<{ id: string; name: string }> | null;
  }>)
    .filter((row) => Array.isArray(row.tags) && typeof row.tags[0]?.name === "string")
    .map((row) => ({
      tagId: row.tag_id,
      tagName: row.tags![0]!.name,
      assignedAt: row.assigned_at,
    }));

  return {
    contact: contactData as unknown as Contact,
    applications: (applicationData ?? []) as unknown as Application[],
    contactNotes: ((noteData ?? []) as unknown as Array<{
      id: string;
      contact_id: string;
      author_id: string;
      author_name: string;
      body: string;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      contact_id: row.contact_id,
      author_id: row.author_id,
      author_name: row.author_name,
      text: row.body,
      created_at: row.created_at,
    })),
    contactTags,
  };
}

export async function listContactIdsForMemory(input: {
  limit?: number;
}): Promise<string[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id")
    .order("created_at", { ascending: true });

  if (typeof input.limit === "number") {
    query = query.limit(input.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list contacts for memory: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Stale-memory discovery
// ---------------------------------------------------------------------------

export async function findStaleContactMemory(input: {
  limit: number;
}): Promise<string[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "find_stale_admin_ai_contact_memory",
    { p_limit: input.limit },
  );

  if (error) {
    throw new Error(`Failed to find stale contact memory: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Array<{ contact_id: string }>;
  return rows.map((r) => r.contact_id);
}
