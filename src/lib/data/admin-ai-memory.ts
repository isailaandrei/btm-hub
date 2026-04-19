/**
 * Admin AI memory — persistence data layer.
 *
 * Helpers for the four memory tables introduced by the Phase 1 memory
 * foundation migration:
 *   - crm_ai_evidence_chunks
 *   - crm_ai_contact_dossiers
 *   - crm_ai_embeddings (schema only here — no helpers yet)
 *
 * Every write goes through `requireAdmin()`. Reads use the server-side
 * Supabase client and rely on the RLS policies installed by the migration
 * to gate visibility.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { buildStableChunkId } from "@/lib/admin-ai-memory/chunk-identity";
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
  CrmAiEvidenceChunkInput,
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
    source_id: c.sourceId,
    source_timestamp: c.sourceTimestamp,
    text: c.text,
    metadata_json: c.metadata,
    content_hash: c.contentHash,
    chunk_version: c.chunkVersion,
  }));

  const { error } = await supabase
    .from("crm_ai_evidence_chunks")
    .upsert(rows, { onConflict: "source_type,source_id" });

  if (error) {
    throw new Error(`Failed to upsert evidence chunks: ${error.message}`);
  }
}

export async function deleteStaleCurrentCrmEvidenceChunksForContact(input: {
  contactId: string;
  retainedSourceKeys: string[];
}): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const sourceTypes = Array.from(CURRENT_CRM_SOURCE_TYPES);

  const { data, error } = await supabase
    .from("crm_ai_evidence_chunks")
    .select("id, source_type, source_id")
    .eq("contact_id", input.contactId)
    .in("source_type", sourceTypes);

  if (error) {
    throw new Error(
      `Failed to load current CRM evidence chunks for pruning: ${error.message}`,
    );
  }

  const retainedKeys = new Set(input.retainedSourceKeys);
  const staleIds = ((data ?? []) as Array<{
    id: string;
    source_type: string;
    source_id: string;
  }>)
    .filter(
      (row) => !retainedKeys.has(`${row.source_type}:${row.source_id}`),
    )
    .map((row) => row.id);

  if (staleIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("crm_ai_evidence_chunks")
    .delete()
    .in("id", staleIds);

  if (deleteError) {
    throw new Error(
      `Failed to delete stale current CRM evidence chunks: ${deleteError.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Contact dossiers
// ---------------------------------------------------------------------------

const DOSSIER_SELECT = [
  "contact_id",
  "dossier_version",
  "generator_version",
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
  staleAt: string | null;
}): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("crm_ai_contact_dossiers")
    .update({
      facts_json: input.facts,
      stale_at: input.staleAt,
    })
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
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("contact_id", input.contactId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("contact_notes")
      .select("*")
      .eq("contact_id", input.contactId)
      .order("created_at", { ascending: true }),
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

  return {
    contact: contactData as Contact,
    applications: (applicationData ?? []) as Application[],
    contactNotes: (noteData ?? []) as ContactNote[],
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
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
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
  const rows = (data ?? []) as Array<{ contact_id: string }>;
  return rows.map((r) => r.contact_id);
}
