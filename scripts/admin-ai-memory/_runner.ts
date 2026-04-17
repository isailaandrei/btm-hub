/**
 * Standalone backfill runner.
 *
 * Reuses the pure `chunk-builder`, `dossier-generator`, `freshness`, and
 * `ranking-card` modules but persists via a service-role Supabase client
 * passed in by the CLI. This avoids needing a Next.js request lifecycle
 * (`cookies()` etc.) when running from `node`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCurrentCrmChunksForContact,
} from "../../src/lib/admin-ai-memory/chunk-builder.ts";
import { buildStableChunkId } from "../../src/lib/admin-ai-memory/chunk-identity.ts";
import { buildDossierContactFacts } from "../../src/lib/admin-ai-memory/contact-facts.ts";
import { generateContactDossier } from "../../src/lib/admin-ai-memory/dossier-generator.ts";
import { DOSSIER_GENERATOR_VERSION } from "../../src/lib/admin-ai-memory/dossier-prompt.ts";
import { DOSSIER_SCHEMA_VERSION } from "../../src/lib/admin-ai-memory/dossier-version.ts";
import {
  computeChunkSourceFingerprint,
  needsContactMemoryRebuild,
} from "../../src/lib/admin-ai-memory/freshness.ts";
import { buildRankingCardFromDossier } from "../../src/lib/admin-ai-memory/ranking-card.ts";
import { CURRENT_CRM_SOURCE_TYPES } from "../../src/lib/admin-ai-memory/source-types.ts";
import type {
  Application,
  Contact,
  ContactNote,
} from "../../src/types/database.ts";
import type { ContactFactRow } from "../../src/types/admin-ai.ts";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
  CrmAiEvidenceChunkInput,
  DossierSourceCoverage,
} from "../../src/types/admin-ai-memory.ts";
import type { BackfillStats } from "../../src/lib/admin-ai-memory/backfill.ts";

function emptyStats(): BackfillStats {
  return {
    contactsProcessed: 0,
    contactsSucceeded: 0,
    contactsFailed: 0,
    contactsRebuilt: 0,
    contactsAlreadyFresh: 0,
    skippedNoChunks: 0,
    skippedMissingSources: 0,
    chunksUpserted: 0,
    dossiersUpserted: 0,
    rankingCardsUpserted: 0,
    failures: [],
  };
}

function buildSourceCoverage(input: {
  applications: number;
  contactNotes: number;
  applicationAdminNotes: number;
}): DossierSourceCoverage {
  return {
    applicationCount: input.applications,
    contactNoteCount: input.contactNotes,
    applicationAdminNoteCount: input.applicationAdminNotes,
    whatsappMessageCount: 0,
    instagramMessageCount: 0,
    zoomChunkCount: 0,
  };
}

async function listContactIds(
  supabase: SupabaseClient,
  limit: number | undefined,
): Promise<string[]> {
  let query = supabase
    .from("contacts")
    .select("id")
    .order("created_at", { ascending: true });
  if (typeof limit === "number") query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list contacts: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function loadContactSources(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  contact: Contact;
  applications: Application[];
  contactNotes: ContactNote[];
} | null> {
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  if (contactErr) throw new Error(`contacts: ${contactErr.message}`);
  if (!contact) return null;

  const [
    { data: applications, error: appErr },
    { data: notes, error: noteErr },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("contact_id", contactId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("contact_notes")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true }),
  ]);
  if (appErr) throw new Error(`applications: ${appErr.message}`);
  if (noteErr) throw new Error(`contact_notes: ${noteErr.message}`);

  return {
    contact: contact as Contact,
    applications: (applications ?? []) as Application[],
    contactNotes: (notes ?? []) as ContactNote[],
  };
}

async function loadContactFactRows(
  supabase: SupabaseClient,
  contactId: string,
): Promise<ContactFactRow[]> {
  const FACTS_SELECT = [
    "contact_id",
    "application_id",
    "contact_name",
    "contact_email",
    "contact_phone",
    "program",
    "status",
    "submitted_at",
    "tag_ids",
    "tag_names",
    "budget",
    "time_availability",
    "start_timeline",
    "btm_category",
    "travel_willingness",
    "languages",
    "country_of_residence",
    "certification_level",
    "years_experience",
    "involvement_level",
  ].join(", ");

  const { data, error } = await supabase
    .from("admin_ai_contact_facts")
    .select(FACTS_SELECT)
    .eq("contact_id", contactId)
    .limit(100);

  if (error) throw new Error(`admin_ai_contact_facts: ${error.message}`);
  return (data ?? []) as ContactFactRow[];
}

async function upsertChunks(
  supabase: SupabaseClient,
  chunks: CrmAiEvidenceChunkInput[],
): Promise<void> {
  if (chunks.length === 0) return;
  const { error } = await supabase.from("crm_ai_evidence_chunks").upsert(
    chunks.map((c) => ({
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
    })),
    { onConflict: "source_type,source_id" },
  );
  if (error) throw new Error(`upsert chunks: ${error.message}`);
}

async function deleteStaleCurrentCrmChunks(input: {
  supabase: SupabaseClient;
  contactId: string;
  retainedSourceKeys: string[];
}): Promise<void> {
  const sourceTypes = Array.from(CURRENT_CRM_SOURCE_TYPES);
  const { data, error } = await input.supabase
    .from("crm_ai_evidence_chunks")
    .select("id, source_type, source_id")
    .eq("contact_id", input.contactId)
    .in("source_type", sourceTypes);

  if (error) {
    throw new Error(`list current CRM chunks: ${error.message}`);
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

  const { error: deleteError } = await input.supabase
    .from("crm_ai_evidence_chunks")
    .delete()
    .in("id", staleIds);

  if (deleteError) {
    throw new Error(`delete stale current CRM chunks: ${deleteError.message}`);
  }
}

async function fetchExistingMemory(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  dossier: CrmAiContactDossier | null;
  rankingCard: CrmAiContactRankingCard | null;
}> {
  const [{ data: dossier, error: dErr }, { data: cards, error: cErr }] =
    await Promise.all([
      supabase
        .from("crm_ai_contact_dossiers")
        .select("*")
        .eq("contact_id", contactId)
        .maybeSingle(),
      supabase
        .from("crm_ai_contact_ranking_cards")
        .select("*")
        .eq("contact_id", contactId)
        .limit(1),
    ]);
  if (dErr) throw new Error(`dossier read: ${dErr.message}`);
  if (cErr) throw new Error(`ranking card read: ${cErr.message}`);
  return {
    dossier: (dossier as CrmAiContactDossier | null) ?? null,
    rankingCard: ((cards ?? []) as CrmAiContactRankingCard[])[0] ?? null,
  };
}

async function rebuildOne(input: {
  supabase: SupabaseClient;
  contactId: string;
  force?: boolean;
}): Promise<{
  status: "rebuilt" | "fresh" | "no_chunks" | "missing_sources";
  chunkCount: number;
}> {
  const sources = await loadContactSources(input.supabase, input.contactId);
  if (!sources) return { status: "missing_sources", chunkCount: 0 };

  const chunks = buildCurrentCrmChunksForContact({
    contact: sources.contact,
    applications: sources.applications,
    contactNotes: sources.contactNotes,
  });
  const retainedSourceKeys = chunks.map(
    (chunk) => `${chunk.sourceType}:${chunk.sourceId}`,
  );
  await deleteStaleCurrentCrmChunks({
    supabase: input.supabase,
    contactId: input.contactId,
    retainedSourceKeys,
  });
  if (chunks.length === 0) return { status: "no_chunks", chunkCount: 0 };

  await upsertChunks(input.supabase, chunks);

  if (!input.force) {
    const existing = await fetchExistingMemory(input.supabase, input.contactId);
    if (
      !needsContactMemoryRebuild({
        dossier: existing.dossier,
        rankingCard: existing.rankingCard,
        chunks,
        generatorVersion: DOSSIER_GENERATOR_VERSION,
      })
    ) {
      return { status: "fresh", chunkCount: chunks.length };
    }
  }

  const fingerprint = computeChunkSourceFingerprint(chunks);
  const sourceCoverage = buildSourceCoverage({
    applications: sources.applications.length,
    contactNotes: sources.contactNotes.length,
    applicationAdminNotes: chunks.filter(
      (c) => c.sourceType === "application_admin_note",
    ).length,
  });

  const factRows = await loadContactFactRows(input.supabase, input.contactId);
  const dossierFacts = buildDossierContactFacts({
    contact: sources.contact,
    factRows,
    applicationCount: sources.applications.length,
  });

  const generation = await generateContactDossier({
    contactId: input.contactId,
    contactFacts: dossierFacts,
    chunks: chunks.map((c) => ({
      chunkId: buildStableChunkId(c.sourceType, c.sourceId),
      sourceType: c.sourceType,
      sourceLabel: String(c.metadata.sourceLabel ?? c.sourceType),
      sourceTimestamp: c.sourceTimestamp,
      text: c.text,
    })),
  });

  const { error: dossierErr } = await input.supabase
    .from("crm_ai_contact_dossiers")
    .upsert(
      {
        contact_id: input.contactId,
        dossier_version: DOSSIER_SCHEMA_VERSION,
        generator_version: generation.generatorVersion,
        source_fingerprint: fingerprint,
        source_coverage: sourceCoverage,
        facts_json: generation.dossier.facts,
        signals_json: generation.dossier.signals,
        contradictions_json: generation.dossier.contradictions,
        unknowns_json: generation.dossier.unknowns,
        evidence_anchors_json: generation.dossier.evidenceAnchors,
        short_summary: generation.dossier.summary.short,
        medium_summary: generation.dossier.summary.medium,
        confidence_json: generation.dossier.confidence ?? {},
        last_built_at: new Date().toISOString(),
        stale_at: null,
      },
      { onConflict: "contact_id" },
    );
  if (dossierErr) throw new Error(`upsert dossier: ${dossierErr.message}`);

  const dossierForCard: CrmAiContactDossier = {
    contact_id: input.contactId,
    dossier_version: DOSSIER_SCHEMA_VERSION,
    generator_version: generation.generatorVersion,
    source_fingerprint: fingerprint,
    source_coverage: sourceCoverage,
    facts_json: generation.dossier.facts,
    signals_json: generation.dossier.signals,
    contradictions_json: generation.dossier.contradictions,
    unknowns_json: generation.dossier.unknowns,
    evidence_anchors_json: generation.dossier.evidenceAnchors,
    short_summary: generation.dossier.summary.short,
    medium_summary: generation.dossier.summary.medium,
    confidence_json: generation.dossier.confidence ?? {},
    last_built_at: new Date().toISOString(),
    stale_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const card = buildRankingCardFromDossier(dossierForCard);
  const { error: cardErr } = await input.supabase
    .from("crm_ai_contact_ranking_cards")
    .upsert(
      {
        contact_id: card.contactId,
        dossier_version: card.dossierVersion,
        source_fingerprint: card.sourceFingerprint,
        facts_json: card.facts,
        top_fit_signals_json: card.topFitSignals,
        top_concerns_json: card.topConcerns,
        confidence_notes_json: card.confidenceNotes,
        short_summary: card.shortSummary,
      },
      { onConflict: "contact_id" },
    );
  if (cardErr) throw new Error(`upsert ranking card: ${cardErr.message}`);

  return { status: "rebuilt", chunkCount: chunks.length };
}

export async function runStandaloneBackfill(input: {
  supabase: SupabaseClient;
  limit?: number;
  contactIds?: string[];
  force?: boolean;
}): Promise<BackfillStats> {
  const stats = emptyStats();
  const ids =
    input.contactIds && input.contactIds.length > 0
      ? input.contactIds
      : await listContactIds(input.supabase, input.limit);

  for (const contactId of ids) {
    stats.contactsProcessed += 1;
    try {
      const result = await rebuildOne({
        supabase: input.supabase,
        contactId,
        force: input.force,
      });
      stats.contactsSucceeded += 1;
      stats.chunksUpserted += result.chunkCount;
      switch (result.status) {
        case "rebuilt":
          stats.contactsRebuilt += 1;
          stats.dossiersUpserted += 1;
          stats.rankingCardsUpserted += 1;
          break;
        case "fresh":
          stats.contactsAlreadyFresh += 1;
          break;
        case "no_chunks":
          stats.skippedNoChunks += 1;
          break;
        case "missing_sources":
          stats.skippedMissingSources += 1;
          break;
      }
    } catch (error) {
      stats.contactsFailed += 1;
      const message = error instanceof Error ? error.message : String(error);
      stats.failures.push({ contactId, error: message });
      console.error(`[backfill] ${contactId} failed:`, message);
    }
  }

  return stats;
}
