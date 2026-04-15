/**
 * Admin AI Analyst — retrieval data layer.
 *
 * Exposes exactly two helpers:
 *   - queryAdminAiContactFacts: SELECT against the `admin_ai_contact_facts`
 *     view with structured filters applied server-side.
 *   - searchAdminAiEvidence: single RPC call to `search_admin_ai_evidence`
 *     for FTS/keyword evidence lookup.
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
  ADMIN_AI_STRUCTURED_FIELDS,
  isAdminAiStructuredField,
} from "@/lib/admin-ai/field-config";
import type {
  AdminAiStructuredFilter,
  ContactFactRow,
  EvidenceItem,
  EvidenceSourceType,
} from "@/types/admin-ai";

// ---------------------------------------------------------------------------
// Columns known to be array-typed on the facts view. For these, `contains`
// must use `.contains(...)` (JSON-array containment) rather than `.ilike(...)`.
// ---------------------------------------------------------------------------

const ARRAY_FACT_FIELDS: ReadonlySet<string> = new Set([
  "tag_ids",
  "tag_names",
]);

function isArrayFactField(field: string): boolean {
  return ARRAY_FACT_FIELDS.has(field);
}

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
  "travel_willingness",
  "languages",
  "country_of_residence",
  "certification_level",
  "years_experience",
  "involvement_level",
].join(", ");

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
    if (!isAdminAiStructuredField(filter.field)) {
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
        if (isArrayFactField(filter.field)) {
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
        if (isArrayFactField(filter.field)) {
          const arr = Array.isArray(filter.value)
            ? filter.value
            : [filter.value];
          query = query.contains(filter.field, arr);
        } else if (typeof filter.value === "string") {
          // Text column: use ILIKE for substring search. We intentionally do
          // NOT escape % / _ here — the planner produces these values from an
          // allowlisted enum or sanitized user text, and the filter column is
          // server-chosen from the allowlist.
          query = query.ilike(filter.field, `%${filter.value}%`);
        }
        break;
      }
    }
  }

  if (input.contactId) {
    query = query.eq("contact_id", input.contactId);
  }

  query = query.limit(input.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to query contact facts: ${error.message}`);
  }

  return (data ?? []) as unknown as ContactFactRow[];
}

// Exposed so callers (e.g. query-plan normalization, tests) can reason about
// the allowlist without importing field-config directly.
export { ADMIN_AI_STRUCTURED_FIELDS };

// ---------------------------------------------------------------------------
// Evidence search
// ---------------------------------------------------------------------------

/**
 * Shape returned by the `search_admin_ai_evidence` RPC. Mirrors the RETURNS
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

export async function searchAdminAiEvidence(input: {
  textFocus: string[];
  contactIds?: string[];
  contactId?: string;
  limit: number;
}): Promise<EvidenceItem[]> {
  await requireAdmin();
  const supabase = await createClient();

  // The SQL function handles the empty-query branch itself, so we can pass
  // an empty string through. Joining with a single space matches the
  // `websearch_to_tsquery` expectation ("dolphins ocean" => two tokens
  // ANDed by default).
  const p_query = input.textFocus.join(" ");

  const { data, error } = await supabase.rpc("search_admin_ai_evidence", {
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
