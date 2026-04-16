/**
 * Admin AI memory — persistence data layer.
 *
 * Helpers for the four memory tables introduced by the Phase 1 memory
 * foundation migration:
 *   - crm_ai_evidence_chunks
 *   - crm_ai_contact_dossiers
 *   - crm_ai_contact_ranking_cards
 *   - crm_ai_embeddings (schema only here — no helpers yet)
 *
 * Every write goes through `requireAdmin()`. Reads use the server-side
 * Supabase client and rely on the RLS policies installed by the migration
 * to gate visibility.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  Application,
  Contact,
  ContactNote,
} from "@/types/database";
import type {
  CrmAiContactDossier,
  CrmAiContactDossierInput,
  CrmAiContactRankingCard,
  CrmAiContactRankingCardInput,
  CrmAiEvidenceChunk,
  CrmAiEvidenceChunkInput,
} from "@/types/admin-ai-memory";

// ---------------------------------------------------------------------------
// Evidence chunks
// ---------------------------------------------------------------------------

const CHUNK_SELECT = [
  "id",
  "contact_id",
  "application_id",
  "source_type",
  "source_id",
  "source_timestamp",
  "text",
  "metadata_json",
  "content_hash",
  "chunk_version",
  "created_at",
  "updated_at",
].join(", ");

export async function upsertEvidenceChunks(input: {
  chunks: CrmAiEvidenceChunkInput[];
}): Promise<void> {
  if (input.chunks.length === 0) return;
  await requireAdmin();
  const supabase = await createClient();

  const rows = input.chunks.map((c) => ({
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
    .upsert(rows, { onConflict: "source_type,source_id,content_hash" });

  if (error) {
    throw new Error(`Failed to upsert evidence chunks: ${error.message}`);
  }
}

export async function listEvidenceChunksByContact(input: {
  contactId: string;
  limit?: number;
}): Promise<CrmAiEvidenceChunk[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("crm_ai_evidence_chunks")
    .select(CHUNK_SELECT)
    .eq("contact_id", input.contactId)
    .order("source_timestamp", { ascending: false, nullsFirst: false });

  if (typeof input.limit === "number") {
    query = query.limit(input.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list evidence chunks: ${error.message}`);
  }
  return (data ?? []) as unknown as CrmAiEvidenceChunk[];
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
    .in("contact_id", input.contactIds);

  if (error) {
    throw new Error(`Failed to list contact dossiers: ${error.message}`);
  }
  return (data ?? []) as unknown as CrmAiContactDossier[];
}

// ---------------------------------------------------------------------------
// Ranking cards
// ---------------------------------------------------------------------------

const RANKING_CARD_SELECT = [
  "contact_id",
  "dossier_version",
  "source_fingerprint",
  "facts_json",
  "top_fit_signals_json",
  "top_concerns_json",
  "confidence_notes_json",
  "short_summary",
  "updated_at",
].join(", ");

export async function upsertRankingCard(
  input: CrmAiContactRankingCardInput,
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const row = {
    contact_id: input.contactId,
    dossier_version: input.dossierVersion,
    source_fingerprint: input.sourceFingerprint,
    facts_json: input.facts,
    top_fit_signals_json: input.topFitSignals,
    top_concerns_json: input.topConcerns,
    confidence_notes_json: input.confidenceNotes,
    short_summary: input.shortSummary,
  };

  const { error } = await supabase
    .from("crm_ai_contact_ranking_cards")
    .upsert(row, { onConflict: "contact_id" });

  if (error) {
    throw new Error(`Failed to upsert ranking card: ${error.message}`);
  }
}

export async function listRankingCards(input: {
  contactIds?: string[];
  limit: number;
}): Promise<CrmAiContactRankingCard[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("crm_ai_contact_ranking_cards")
    .select(RANKING_CARD_SELECT);

  if (input.contactIds && input.contactIds.length > 0) {
    query = query.in("contact_id", input.contactIds);
  }

  query = query.limit(input.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list ranking cards: ${error.message}`);
  }
  return (data ?? []) as unknown as CrmAiContactRankingCard[];
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
