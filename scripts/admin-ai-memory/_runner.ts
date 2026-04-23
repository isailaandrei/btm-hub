/**
 * Standalone backfill runner.
 *
 * Reuses the pure memory modules but persists via a service-role Supabase
 * client passed in by the CLI. This avoids needing a Next.js request
 * lifecycle (`cookies()` etc.) when running from `node`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCurrentCrmChunksForContact,
  type ContactTagChunkSource,
} from "../../src/lib/admin-ai-memory/chunk-builder.ts";
import { buildStableChunkId } from "../../src/lib/admin-ai-memory/chunk-identity.ts";
import { selectChunksForDossier } from "../../src/lib/admin-ai-memory/dossier-chunk-selection.ts";
import { buildFactObservationsFromChunks } from "../../src/lib/admin-ai-memory/fact-observations.ts";
import { compileContactProfileFacts } from "../../src/lib/admin-ai-memory/profile-compiler.ts";
import { buildEvidenceSubchunks } from "../../src/lib/admin-ai-memory/subchunk-builder.ts";
import { generateSubchunkEmbeddings } from "../../src/lib/admin-ai-memory/embeddings.ts";
import { generateContactDossier } from "../../src/lib/admin-ai-memory/dossier-generator.ts";
import { DOSSIER_GENERATOR_VERSION } from "../../src/lib/admin-ai-memory/dossier-prompt.ts";
import { DOSSIER_SCHEMA_VERSION } from "../../src/lib/admin-ai-memory/dossier-version.ts";
import {
  computeChunkSourceFingerprint,
  isDossierStale,
} from "../../src/lib/admin-ai-memory/freshness.ts";
import { CURRENT_CRM_SOURCE_TYPES } from "../../src/lib/admin-ai-memory/source-types.ts";
import type {
  Application,
  Contact,
  ContactNote,
} from "../../src/types/database.ts";
import type {
  CrmAiContactDossier,
  CrmAiEvidenceChunkInput,
  CrmAiEvidenceSubchunkInput,
  CrmAiEmbeddingInput,
  CrmAiFactObservation,
  CrmAiFactObservationInput,
  DossierSourceCoverage,
} from "../../src/types/admin-ai-memory.ts";
import type { BackfillStats } from "../../src/lib/admin-ai-memory/backfill.ts";

const DEBUG_ENABLED = () =>
  process.env.ADMIN_AI_BACKFILL_DEBUG?.trim() === "1";

// ---------------------------------------------------------------------------
// Transport retry
//
// Wraps a Supabase write so a transient `TypeError: fetch failed` or
// `AbortError` from the edge doesn't kill the whole contact. Bounded at
// two retries with short backoff. Validation / constraint errors
// propagate immediately.
// ---------------------------------------------------------------------------

const TRANSIENT_TRANSPORT_PATTERNS = [
  /fetch failed/i,
  /network( |-)?request failed/i,
  /socket (hang up|disconnected)/i,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /ECONNREFUSED/,
];

function isTransientTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const message = error.message ?? "";
  const causeMessage =
    error.cause instanceof Error ? error.cause.message : "";
  return TRANSIENT_TRANSPORT_PATTERNS.some(
    (pattern) => pattern.test(message) || pattern.test(causeMessage),
  );
}

async function withTransportRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientTransportError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = baseDelayMs * attempt;
      console.warn(
        `[backfill] ${label} transient transport error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`,
        error instanceof Error ? error.message : String(error),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

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
    failures: [],
  };
}

export type StructuralRefreshStats = {
  contactsProcessed: number;
  contactsSucceeded: number;
  contactsFailed: number;
  contactsPatched: number;
  contactsWithoutDossier: number;
  skippedMissingSources: number;
  failures: Array<{ contactId: string; error: string }>;
};

function emptyStructuralRefreshStats(): StructuralRefreshStats {
  return {
    contactsProcessed: 0,
    contactsSucceeded: 0,
    contactsFailed: 0,
    contactsPatched: 0,
    contactsWithoutDossier: 0,
    skippedMissingSources: 0,
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
  contactTags: ContactTagChunkSource[];
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
    { data: contactTags, error: tagErr },
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
    supabase
      .from("contact_tags")
      .select("tag_id, assigned_at, tags(id, name)")
      .eq("contact_id", contactId)
      .order("assigned_at", { ascending: true }),
  ]);
  if (appErr) throw new Error(`applications: ${appErr.message}`);
  if (noteErr) throw new Error(`contact_notes: ${noteErr.message}`);
  if (tagErr) throw new Error(`contact_tags: ${tagErr.message}`);

  return {
    contact: contact as Contact,
    applications: (applications ?? []) as Application[],
    contactNotes: (notes ?? []) as ContactNote[],
    contactTags: ((contactTags ?? []) as Array<{
      tag_id: string;
      assigned_at: string | null;
      tags: Array<{ id: string; name: string }> | null;
    }>)
      .filter((row) => Array.isArray(row.tags) && typeof row.tags[0]?.name === "string")
      .map((row) => ({
        tagId: row.tag_id,
        tagName: row.tags![0]!.name,
        assignedAt: row.assigned_at,
      })),
  };
}

async function listFactObservations(
  supabase: SupabaseClient,
  contactId: string,
): Promise<CrmAiFactObservation[]> {
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

  const { data, error } = await supabase
    .from("crm_ai_fact_observations")
    .select(FACT_OBSERVATION_SELECT)
    .eq("contact_id", contactId)
    .is("invalidated_at", null)
    .order("observed_at", { ascending: false });

  if (error) throw new Error(`crm_ai_fact_observations: ${error.message}`);
  return (data ?? []) as CrmAiFactObservation[];
}

async function listCurrentStoredCrmChunks(
  supabase: SupabaseClient,
  contactId: string,
): Promise<CrmAiEvidenceChunkInput[]> {
  const { data, error } = await supabase
    .from("crm_ai_evidence_chunks")
    .select([
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
    ].join(", "))
    .eq("contact_id", contactId)
    .in("source_type", Array.from(CURRENT_CRM_SOURCE_TYPES))
    .is("superseded_at", null)
    .order("source_timestamp", { ascending: true, nullsFirst: true })
    .order("source_type", { ascending: true })
    .order("source_id", { ascending: true });

  if (error) throw new Error(`crm_ai_evidence_chunks: ${error.message}`);

  return ((data ?? []) as Array<{
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
  }>).map((row) => ({
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

async function patchDossierStructural(input: {
  supabase: SupabaseClient;
  contactId: string;
  facts: Record<string, unknown>;
  dossierVersion: number;
  sourceFingerprint: string;
  sourceCoverage: DossierSourceCoverage;
  staleAt: string | null;
}): Promise<void> {
  const { error } = await input.supabase
    .from("crm_ai_contact_dossiers")
    .update({
      facts_json: input.facts,
      dossier_version: input.dossierVersion,
      source_fingerprint: input.sourceFingerprint,
      source_coverage: input.sourceCoverage,
      stale_at: input.staleAt,
    })
    .eq("contact_id", input.contactId);

  if (error) {
    throw new Error(`patch dossier structural: ${error.message}`);
  }
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
      logical_source_id: c.logicalSourceId,
      source_id: c.sourceId,
      source_timestamp: c.sourceTimestamp,
      text: c.text,
      metadata_json: c.metadata,
      content_hash: c.contentHash,
      chunk_version: c.chunkVersion,
      superseded_at: null,
    })),
    { onConflict: "source_type,source_id" },
  );
  if (error) throw new Error(`upsert chunks: ${error.message}`);
}

async function upsertSubchunks(
  supabase: SupabaseClient,
  subchunks: CrmAiEvidenceSubchunkInput[],
): Promise<void> {
  if (subchunks.length === 0) return;
  const { error } = await supabase.from("crm_ai_evidence_subchunks").upsert(
    subchunks.map((subchunk) => ({
      id: subchunk.id,
      parent_chunk_id: subchunk.parentChunkId,
      contact_id: subchunk.contactId,
      application_id: subchunk.applicationId,
      subchunk_index: subchunk.subchunkIndex,
      text: subchunk.text,
      content_hash: subchunk.contentHash,
      token_estimate: subchunk.tokenEstimate,
      metadata_json: subchunk.metadata,
    })),
    { onConflict: "id" },
  );
  if (error) throw new Error(`upsert subchunks: ${error.message}`);
}

async function upsertEmbeddings(
  supabase: SupabaseClient,
  embeddings: CrmAiEmbeddingInput[],
): Promise<void> {
  if (embeddings.length === 0) return;
  const { error } = await supabase.from("crm_ai_embeddings").upsert(
    embeddings.map((embedding) => ({
      target_type: embedding.targetType,
      target_id: embedding.targetId,
      embedding_model: embedding.embeddingModel,
      embedding_version: embedding.embeddingVersion,
      content_hash: embedding.contentHash,
      embedding: embedding.embedding,
    })),
    {
      onConflict:
        "target_type,target_id,embedding_model,embedding_version,content_hash",
    },
  );
  if (error) throw new Error(`upsert embeddings: ${error.message}`);
}

async function upsertFactObservations(
  supabase: SupabaseClient,
  observations: CrmAiFactObservationInput[],
): Promise<void> {
  if (observations.length === 0) return;

  const { error } = await supabase.from("crm_ai_fact_observations").upsert(
    observations.map((observation) => ({
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
    })),
    { onConflict: "id" },
  );

  if (error) throw new Error(`upsert fact observations: ${error.message}`);
}

async function supersedeStaleCurrentCrmChunks(input: {
  supabase: SupabaseClient;
  contactId: string;
  chunks: CrmAiEvidenceChunkInput[];
}): Promise<void> {
  const sourceTypes = Array.from(CURRENT_CRM_SOURCE_TYPES);
  const { data, error } = await input.supabase
    .from("crm_ai_evidence_chunks")
    .select("id, source_type, logical_source_id, source_id, superseded_at")
    .eq("contact_id", input.contactId)
    .in("source_type", sourceTypes)
    .is("superseded_at", null);

  if (error) {
    throw new Error(`list current CRM chunks: ${error.message}`);
  }

  const currentByLogicalKey = new Map(
    input.chunks.map((chunk) => [
      `${chunk.sourceType}:${chunk.logicalSourceId}`,
      chunk.sourceId,
    ]),
  );

  const staleIds = ((data ?? []) as Array<{
    id: string;
    source_type: string;
    logical_source_id: string;
    source_id: string;
    superseded_at: string | null;
  }>)
    .filter((row) => {
      const nextSourceId = currentByLogicalKey.get(
        `${row.source_type}:${row.logical_source_id}`,
      );
      if (!nextSourceId) return true;
      return nextSourceId !== row.source_id;
    })
    .map((row) => row.id);

  if (staleIds.length === 0) return;

  const { error: updateError } = await input.supabase
    .from("crm_ai_evidence_chunks")
    .update({ superseded_at: new Date().toISOString() })
    .in("id", staleIds);

  if (updateError) {
    throw new Error(`supersede stale current CRM chunks: ${updateError.message}`);
  }
}

async function fetchExistingMemory(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  dossier: CrmAiContactDossier | null;
}> {
  const { data: dossier, error: dErr } = await supabase
    .from("crm_ai_contact_dossiers")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (dErr) throw new Error(`dossier read: ${dErr.message}`);
  return {
    dossier: (dossier as CrmAiContactDossier | null) ?? null,
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
    contactTags: sources.contactTags,
  });
  await supersedeStaleCurrentCrmChunks({
    supabase: input.supabase,
    contactId: input.contactId,
    chunks,
  });
  if (chunks.length === 0) return { status: "no_chunks", chunkCount: 0 };

  await upsertChunks(input.supabase, chunks);
  const subchunks = buildEvidenceSubchunks({ chunks });
  await upsertSubchunks(input.supabase, subchunks);
  try {
    const embeddingBatch = await generateSubchunkEmbeddings({
      parentChunks: chunks,
      subchunks,
    });
    await upsertEmbeddings(input.supabase, embeddingBatch.rows);
  } catch (error) {
    console.warn(
      "[backfill] subchunk embedding generation failed",
      {
        contactId: input.contactId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
  const directObservations = buildFactObservationsFromChunks({ chunks });
  if (directObservations.length > 0) {
    await upsertFactObservations(input.supabase, directObservations);
  }

  if (!input.force) {
    const existing = await fetchExistingMemory(input.supabase, input.contactId);
    if (
      !isDossierStale({
        dossier: existing.dossier,
        chunks,
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
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

  const observations = await listFactObservations(input.supabase, input.contactId);
  const dossierFacts = compileContactProfileFacts({
    contact: sources.contact,
    applications: sources.applications,
    currentChunks: chunks,
    observations,
  });

  // Narrow the chunks handed to the dossier model. Full chunks still
  // sit in crm_ai_evidence_chunks for answer-time retrieval — only the
  // prompt gets the bounded subset.
  const selection = selectChunksForDossier(chunks);
  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  const maxChunkChars = chunks.reduce(
    (max, c) => Math.max(max, c.text.length),
    0,
  );
  const shouldLogDiagnostics =
    DEBUG_ENABLED() || selection.stats.truncated;
  if (shouldLogDiagnostics) {
    console.info(
      "[backfill] dossier input diagnostics",
      {
        contactId: input.contactId,
        chunkCount: chunks.length,
        selectedChunkCount: selection.stats.selectedCount,
        totalChars,
        selectedChars: selection.stats.selectedChars,
        maxChunkChars,
        applicationCount: sources.applications.length,
        contactNoteCount: sources.contactNotes.length,
        applicationAdminNoteCount: sourceCoverage.applicationAdminNoteCount,
        truncated: selection.stats.truncated,
        droppedByChunkCap: selection.stats.droppedByChunkCap,
        droppedByCharCap: selection.stats.droppedByCharCap,
        dossierModel:
          process.env.OPENAI_DOSSIER_MODEL?.trim() ||
          process.env.OPENAI_MODEL?.trim() ||
          "gpt-5-mini",
      },
    );
  }

  let generation;
  try {
    generation = await generateContactDossier({
      contactId: input.contactId,
      contactFacts: dossierFacts,
      chunks: selection.selected.map((c) => ({
        chunkId: buildStableChunkId(c.sourceType, c.sourceId),
        sourceType: c.sourceType,
        sourceLabel: String(c.metadata.sourceLabel ?? c.sourceType),
        sourceTimestamp: c.sourceTimestamp,
        text: c.text,
      })),
    });
  } catch (error) {
    // On failure, always log diagnostics so the next triage pass can see
    // whether this was a size issue vs a prompt/schema issue.
    if (!shouldLogDiagnostics) {
      console.error(
        "[backfill] dossier generation failed — post-mortem diagnostics",
        {
          contactId: input.contactId,
          chunkCount: chunks.length,
          selectedChunkCount: selection.stats.selectedCount,
          totalChars,
          selectedChars: selection.stats.selectedChars,
          maxChunkChars,
          applicationCount: sources.applications.length,
          contactNoteCount: sources.contactNotes.length,
          applicationAdminNoteCount: sourceCoverage.applicationAdminNoteCount,
          truncated: selection.stats.truncated,
        },
      );
    }
    throw error;
  }

  if (DEBUG_ENABLED() && generation.modelMetadata.repairAttempted) {
    console.info(
      "[backfill] dossier repair retry succeeded",
      {
        contactId: input.contactId,
        responseId: generation.modelMetadata.responseId,
      },
    );
  }

  await withTransportRetry(
    `upsert dossier (${input.contactId})`,
    async () => {
      const { error: dossierErr } = await input.supabase
        .from("crm_ai_contact_dossiers")
        .upsert(
          {
            contact_id: input.contactId,
            dossier_version: DOSSIER_SCHEMA_VERSION,
            generator_version: generation.generatorVersion,
            generator_model: generation.modelMetadata.model,
            source_fingerprint: fingerprint,
            source_coverage: sourceCoverage,
            facts_json: dossierFacts,
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
    },
  );

  return { status: "rebuilt", chunkCount: chunks.length };
}

async function refreshStructuralOne(input: {
  supabase: SupabaseClient;
  contactId: string;
}): Promise<{
  status: "patched" | "no_dossier" | "missing_sources";
  chunkCount: number;
}> {
  const sources = await loadContactSources(input.supabase, input.contactId);
  if (!sources) return { status: "missing_sources", chunkCount: 0 };

  const existing = await fetchExistingMemory(input.supabase, input.contactId);
  if (!existing.dossier) {
    return { status: "no_dossier", chunkCount: 0 };
  }

  const currentChunks = await listCurrentStoredCrmChunks(
    input.supabase,
    input.contactId,
  );
  const observations = await listFactObservations(
    input.supabase,
    input.contactId,
  );
  const facts = compileContactProfileFacts({
    contact: sources.contact,
    applications: sources.applications,
    currentChunks,
    observations,
  });
  const sourceCoverage = buildSourceCoverage({
    applications: sources.applications.length,
    contactNotes: sources.contactNotes.length,
    applicationAdminNotes: currentChunks.filter(
      (chunk) => chunk.sourceType === "application_admin_note",
    ).length,
  });

  await withTransportRetry(
    `patch dossier structural (${input.contactId})`,
    () =>
      patchDossierStructural({
        supabase: input.supabase,
        contactId: input.contactId,
        facts,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
        sourceFingerprint: computeChunkSourceFingerprint(currentChunks),
        sourceCoverage,
        staleAt: existing.dossier?.stale_at ?? null,
      }),
  );

  return { status: "patched", chunkCount: currentChunks.length };
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

export async function runStandaloneStructuralRefresh(input: {
  supabase: SupabaseClient;
  limit?: number;
  contactIds?: string[];
}): Promise<StructuralRefreshStats> {
  const stats = emptyStructuralRefreshStats();
  const ids =
    input.contactIds && input.contactIds.length > 0
      ? input.contactIds
      : await listContactIds(input.supabase, input.limit);

  for (const contactId of ids) {
    stats.contactsProcessed += 1;
    try {
      const result = await refreshStructuralOne({
        supabase: input.supabase,
        contactId,
      });
      stats.contactsSucceeded += 1;
      switch (result.status) {
        case "patched":
          stats.contactsPatched += 1;
          break;
        case "no_dossier":
          stats.contactsWithoutDossier += 1;
          break;
        case "missing_sources":
          stats.skippedMissingSources += 1;
          break;
      }
    } catch (error) {
      stats.contactsFailed += 1;
      const message = error instanceof Error ? error.message : String(error);
      stats.failures.push({ contactId, error: message });
      console.error(`[structural-refresh] ${contactId} failed:`, message);
    }
  }

  return stats;
}
