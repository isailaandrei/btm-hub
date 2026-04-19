/**
 * Admin AI Analyst — retrieval data layer.
 *
 * Exposes three retrieval helpers:
 *   - queryAdminAiContactFacts: SELECT against the `admin_ai_contact_facts`
 *     view with structured filters applied server-side.
 *   - searchAdminAiEvidence: single RPC call to `search_admin_ai_chunk_evidence`
 *     for FTS/keyword evidence lookup over normalized chunk storage.
 *   - listRecentAdminAiEvidence: single SELECT against `crm_ai_evidence_chunks`
 *     for bounded fallback evidence when keyword retrieval comes back empty.
 *
 * Rules (see plan "Non-negotiable guardrails"):
 *   - ONE Supabase call per helper.
 *   - No per-contact N+1 fetches.
 *   - Ranking/FTS logic lives in SQL, not here.
 *   - Unknown filter fields are silently dropped (Zod in Task 2 is the
 *     primary enforcer; this is defense-in-depth).
 */

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ADMIN_AI_FACT_FILTER_FIELDS,
  isAdminAiArrayFactField,
} from "@/lib/admin-ai/field-config";
import { escapeSearchTerm } from "@/lib/data/applications";
import type {
  AdminAiStructuredFilter,
  ContactFactRow,
  EvidenceItem,
  EvidenceSourceType,
} from "@/types/admin-ai";

// Shape returned by `admin_ai_contact_facts`. Listed explicitly so we can
// call `.select(FACTS_SELECT)` without relying on `*` (stable over schema
// changes).
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

/**
 * Structured fields that are actually materialized on `admin_ai_contact_facts`.
 *
 * This is intentionally narrower than `ADMIN_AI_STRUCTURED_FIELDS`, which
 * includes the broader registry-derived planner allowlist. The data layer must
 * only emit filters against columns that exist on the SQL view; anything else
 * is skipped as defense-in-depth so a planner mismatch cannot become a runtime
 * SQL error.
 */
const FACT_FILTER_FIELDS = new Set<string>(ADMIN_AI_FACT_FILTER_FIELDS);

// ---------------------------------------------------------------------------
// Facts query
// ---------------------------------------------------------------------------

export async function queryAdminAiContactFacts(input: {
  filters: AdminAiStructuredFilter[];
  contactId?: string;
  limit: number;
}): Promise<ContactFactRow[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("admin_ai_contact_facts")
    .select(FACTS_SELECT);

  for (const filter of input.filters) {
    if (!FACT_FILTER_FIELDS.has(filter.field)) {
      // Defense-in-depth. The Zod layer should already reject this.
      continue;
    }

    switch (filter.op) {
      case "eq": {
        if (typeof filter.value === "string") {
          query = query.eq(filter.field, filter.value);
        }
        break;
      }
      case "in": {
        if (isAdminAiArrayFactField(filter.field)) {
          // Array-typed columns (tag_ids, tag_names): "in" semantically
          // means "row's array contains any/all of these values". Postgres
          // array containment via `.contains(...)` is the correct operator
          // — `.in(...)` would compare the whole array to a list of scalars.
          const arr = Array.isArray(filter.value)
            ? filter.value
            : [filter.value];
          query = query.contains(filter.field, arr);
        } else if (Array.isArray(filter.value)) {
          query = query.in(filter.field, filter.value);
        } else if (typeof filter.value === "string") {
          // Tolerate a single-value "in" — degrade to eq.
          query = query.eq(filter.field, filter.value);
        }
        break;
      }
      case "contains": {
        if (isAdminAiArrayFactField(filter.field)) {
          const arr = Array.isArray(filter.value)
            ? filter.value
            : [filter.value];
          query = query.contains(filter.field, arr);
        } else if (typeof filter.value === "string") {
          // Text column: use ILIKE for substring search. Escape % / _ as
          // defense-in-depth — the planner is expected to pass allowlisted /
          // sanitized values, but the filter column comes from a planner-
          // chosen allowlist and we do not want an unexpectedly wildcarded
          // value to broaden the match set silently.
          query = query.ilike(
            filter.field,
            `%${escapeSearchTerm(filter.value)}%`,
          );
        }
        break;
      }
    }
  }

  if (input.contactId) {
    query = query.eq("contact_id", input.contactId);
  }

  query = query
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(input.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to query contact facts: ${error.message}`);
  }

  return (data ?? []) as unknown as ContactFactRow[];
}

// ---------------------------------------------------------------------------
// Evidence search
// ---------------------------------------------------------------------------

/**
 * Shape returned by the `search_admin_ai_chunk_evidence` RPC. Mirrors the RETURNS
 * TABLE declaration in the migration so we can camelCase the rows for the
 * caller without re-stating the columns in the function signature.
 */
type EvidenceRpcRow = {
  evidence_id: string;
  contact_id: string;
  application_id: string | null;
  source_type: EvidenceSourceType;
  source_id: string;
  source_label: string;
  source_timestamp: string | null;
  program: string | null;
  text: string;
};

type EvidenceChunkRow = {
  id: string;
  contact_id: string;
  application_id: string | null;
  source_type: EvidenceSourceType;
  source_id: string;
  source_timestamp: string | null;
  text: string;
  metadata_json: Record<string, unknown> | null;
};

const EVIDENCE_CHUNK_SELECT = [
  "id",
  "contact_id",
  "application_id",
  "source_type",
  "source_id",
  "source_timestamp",
  "text",
  "metadata_json",
].join(", ");

function mapChunkRowToEvidenceItem(row: EvidenceChunkRow): EvidenceItem {
  const metadata = row.metadata_json ?? {};
  return {
    evidenceId: row.id,
    contactId: row.contact_id,
    applicationId: row.application_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel:
      typeof metadata.sourceLabel === "string"
        ? metadata.sourceLabel
        : row.source_type,
    sourceTimestamp: row.source_timestamp,
    program: typeof metadata.program === "string" ? metadata.program : null,
    text: row.text,
  };
}

export async function searchAdminAiEvidence(input: {
  textFocus: string[];
  contactIds?: string[];
  contactId?: string;
  limit: number;
  /**
   * "any" → join tokens with ` OR ` so chunks matching any single token
   * surface (ranked higher when more tokens match, via ts_rank_cd).
   * "all" → join with spaces so chunks must match every token (the old
   * strict behavior).
   *
   * Defaults to "any". AND semantics were silently dropping chunks that
   * contained the user's most important keywords (e.g. a chunk with
   * "National Geographic" but not the other filler words in the
   * question); with OR the ranking function still prioritizes
   * more-complete matches, so precision survives while recall jumps.
   */
  matchMode?: "any" | "all";
}): Promise<EvidenceItem[]> {
  await requireAdmin();
  const supabase = await createClient();

  // The SQL function handles the empty-query branch itself, so we can pass
  // an empty string through.
  const mode = input.matchMode ?? "any";
  const p_query = input.textFocus.length === 0
    ? ""
    : mode === "all"
      ? input.textFocus.join(" ")
      : input.textFocus.join(" OR ");

  const { data, error } = await supabase.rpc("search_admin_ai_chunk_evidence", {
    p_query,
    p_contact_ids: input.contactIds && input.contactIds.length > 0
      ? input.contactIds
      : null,
    p_contact_id: input.contactId ?? null,
    p_limit: input.limit,
  });

  if (error) {
    throw new Error(`Failed to search admin AI evidence: ${error.message}`);
  }

  const rows = (data ?? []) as EvidenceRpcRow[];
  return rows.map((row) => ({
    evidenceId: row.evidence_id,
    contactId: row.contact_id,
    applicationId: row.application_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    sourceTimestamp: row.source_timestamp,
    program: row.program,
    text: row.text,
  }));
}

export async function listRecentAdminAiEvidence(input: {
  contactIds?: string[];
  contactId?: string;
  limit: number;
}): Promise<EvidenceItem[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("crm_ai_evidence_chunks")
    .select(EVIDENCE_CHUNK_SELECT);

  if (input.contactId) {
    query = query.eq("contact_id", input.contactId);
  } else if (input.contactIds && input.contactIds.length > 0) {
    query = query.in("contact_id", input.contactIds);
  }

  query = query
    .order("source_timestamp", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(input.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list recent admin AI evidence: ${error.message}`);
  }

  return ((data ?? []) as unknown as EvidenceChunkRow[]).map(
    mapChunkRowToEvidenceItem,
  );
}

export async function listAdminAiEvidenceByIds(input: {
  evidenceIds: string[];
}): Promise<EvidenceItem[]> {
  if (input.evidenceIds.length === 0) return [];
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_ai_evidence_chunks")
    .select(EVIDENCE_CHUNK_SELECT)
    .in("id", input.evidenceIds)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to list admin AI evidence by ids: ${error.message}`);
  }

  return ((data ?? []) as unknown as EvidenceChunkRow[]).map(
    mapChunkRowToEvidenceItem,
  );
}
