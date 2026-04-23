/**
 * Shared contracts for the admin AI analyst feature.
 *
 * These types are consumed across the server action, query planner,
 * provider adapter, persistence layer, and UI. Keep field names aligned
 * with the DB columns defined in
 * `supabase/migrations/20260415000001_admin_ai_analyst.sql`.
 */

import type { DossierSignals } from "@/types/admin-ai-memory";

// ---------------------------------------------------------------------------
// Scope, mode, and query plan
// ---------------------------------------------------------------------------

export type AdminAiScope = "global" | "contact";

export type AdminAiMode = "global_search" | "contact_synthesis";

/**
 * Phase 1 filter operators. The approved spec (2026-04-15) defines
 * `"eq" | "in" | "contains" | "exists" | "range"`; Phase 1 narrows this
 * to the three listed operators per the implementation plan. Range and
 * existence checks will be routed through textFocus for now and can
 * be re-introduced in a later phase by widening this union and the
 * matching SQL helpers.
 */
export type AdminAiStructuredFilterOp = "eq" | "in" | "contains";

export type AdminAiStructuredFilter = {
  field: string;
  op: AdminAiStructuredFilterOp;
  value: string | string[];
};

export type AdminAiQueryPlan = {
  mode: AdminAiMode;
  contactId?: string;
  structuredFilters: AdminAiStructuredFilter[];
  textFocus: string[];
  requestedLimit: number;
};

// ---------------------------------------------------------------------------
// Whole-cohort single-pass reasoning
// ---------------------------------------------------------------------------

export type GlobalCohortProjection = {
  contactId: string;
  contactName: string | null;
  memoryStatus: "fresh" | "stale" | "missing";
  coverage: {
    applicationCount: number;
    contactNoteCount: number;
    applicationAdminNoteCount: number;
  };
  facts: {
    programHistory: string[];
    statusHistory: string[];
    tagNames: string[];
    budgetValues?: string[];
    timeAvailabilityValues?: string[];
    travelWillingnessValues?: string[];
    languageValues?: string[];
    countryOfResidenceValues?: string[];
    currentStructuredFields?: Array<{
      fieldKey: string;
      rawValues: string[];
      normalizedValues: string[];
    }>;
    conflictingFieldKeys?: string[];
  };
  signals?: DossierSignals;
  summary: string | null;
  supportRefs: Array<{
    supportRef: string;
    claim: string;
    confidence: "high" | "medium" | "low";
  }>;
  contradictions: string[];
  unknowns: string[];
};

// ---------------------------------------------------------------------------
// Evidence retrieval
// ---------------------------------------------------------------------------

export type EvidenceSourceType =
  | "application_answer"
  | "application_structured_field"
  | "contact_note"
  | "contact_tag"
  | "application_admin_note";

export type EvidenceItem = {
  evidenceId: string;
  contactId: string;
  applicationId: string | null;
  sourceType: EvidenceSourceType;
  sourceId: string;
  sourceLabel: string;
  sourceTimestamp: string | null;
  program: string | null;
  text: string;
};

// ---------------------------------------------------------------------------
// Model response shape
// ---------------------------------------------------------------------------

export type AdminAiCitation = {
  evidenceId: string;
  claimKey: string;
};

export type AdminAiShortlistEntry = {
  contactId: string;
  contactName: string;
  whyFit: string[];
  concerns: string[];
  citations: AdminAiCitation[];
};

export type AdminAiContactAssessment = {
  inferredQualities: string[];
  concerns: string[];
  citations: AdminAiCitation[];
};

export type AdminAiResponse = {
  shortlist?: AdminAiShortlistEntry[];
  contactAssessment?: AdminAiContactAssessment;
  uncertainty: string[];
};

// ---------------------------------------------------------------------------
// DB row mirrors (match migration 20260415000001_admin_ai_analyst.sql)
// ---------------------------------------------------------------------------

/** Row shape of `admin_ai_threads`. */
export type AdminAiThread = {
  id: string;
  author_id: string;
  scope: AdminAiScope;
  contact_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AdminAiMessageRole = "user" | "assistant";
export type AdminAiMessageStatus = "complete" | "failed";

/** Row shape of `admin_ai_messages`. */
export type AdminAiMessage = {
  id: string;
  thread_id: string;
  role: AdminAiMessageRole;
  content: string;
  status: AdminAiMessageStatus;
  /** Stored as jsonb; logically an `AdminAiQueryPlan` for assistant rows. */
  query_plan: AdminAiQueryPlan | null;
  /** Stored as jsonb; logically an `AdminAiResponse` for assistant rows. */
  response_json: AdminAiResponse | null;
  /** Provider metadata (model id, latency, token counts, etc.). */
  model_metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Row shape of `admin_ai_message_citations`. */
export type AdminAiCitationRow = {
  id: string;
  message_id: string;
  claim_key: string;
  source_type: EvidenceSourceType;
  source_id: string;
  contact_id: string;
  application_id: string | null;
  source_label: string;
  snippet: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// UI-facing summaries
// ---------------------------------------------------------------------------

/** Summary used by the thread list UI. */
export type AdminAiThreadSummary = {
  id: string;
  scope: AdminAiScope;
  contactId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** Summary used when rendering a conversation's messages. */
export type AdminAiMessageSummary = {
  id: string;
  threadId: string;
  role: AdminAiMessageRole;
  status: AdminAiMessageStatus;
  content: string;
  createdAt: string;
  queryPlan: AdminAiQueryPlan | null;
  response: AdminAiResponse | null;
  citations: AdminAiCitationRow[];
};

// ---------------------------------------------------------------------------
// Data-layer row shapes
// ---------------------------------------------------------------------------

/**
 * One row from the `admin_ai_contact_facts` view.
 *
 * Column names mirror the SQL view exactly (snake_case) so the data-layer
 * query helper can hand the rows back to callers without renaming keys.
 */
export type ContactFactRow = {
  contact_id: string;
  application_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  program: string | null;
  status: string | null;
  submitted_at: string | null;
  tag_ids: string[];
  tag_names: string[];
  budget: string | null;
  time_availability: string | null;
  start_timeline: string | null;
  btm_category: string | null;
  travel_willingness: string | null;
  languages: string | null;
  country_of_residence: string | null;
  certification_level: string | null;
  years_experience: string | null;
  involvement_level: string | null;
};

/**
 * Draft shape for inserting into `admin_ai_message_citations`. Mirrors the
 * row shape but omits DB-generated columns (`id`, `message_id`, `created_at`).
 * The `message_id` is passed separately by the batch insert helper so callers
 * cannot accidentally mix citations across messages.
 */
export type AdminAiCitationDraft = {
  claim_key: string;
  source_type: EvidenceSourceType;
  source_id: string;
  contact_id: string;
  application_id: string | null;
  source_label: string;
  snippet: string;
};
