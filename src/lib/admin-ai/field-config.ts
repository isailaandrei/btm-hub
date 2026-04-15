/**
 * Single source of truth for the admin AI analyst's allowlisted fields.
 *
 * There are intentionally two allowlists in the codebase:
 *
 *   1. This TypeScript file (consumed by the query planner, server action,
 *      Zod schema validation, and UI).
 *   2. The SQL `admin_ai_evidence_items` view in
 *      `supabase/migrations/20260415000001_admin_ai_analyst.sql` (lines
 *      ~393–403 inside the CROSS JOIN LATERAL VALUES clause).
 *
 * These must stay in sync manually. If you change `ADMIN_AI_TEXT_FIELDS`
 * below, update the SQL `VALUES (...)` clause to match, and vice versa.
 * Any other field-level metadata (labels, options, canonicalization) comes
 * from the shared contacts `FIELD_REGISTRY` so there is no second source
 * of truth for those properties.
 */

import {
  FIELD_REGISTRY,
  getFieldEntry,
  type FieldRegistryEntry,
} from "@/app/(dashboard)/admin/contacts/field-registry";

// ---------------------------------------------------------------------------
// Structured (filterable) fields
// ---------------------------------------------------------------------------

/**
 * Facts-view meta columns that exist on `admin_ai_contact_facts` but are NOT
 * part of `FIELD_REGISTRY` (the registry only describes per-application
 * curated answers, not the joined contact/application envelope).
 *
 * These columns are first-class structured filter targets per the spec
 * (§Structured read model, §Internal query plan) and are materialized by
 * the view defined in
 * `supabase/migrations/20260415000001_admin_ai_analyst.sql`.
 *
 * They must be included in the allowlist so filters like
 * `{ field: "program", op: "eq", value: "freediving" }` survive the
 * defense-in-depth check in `queryAdminAiContactFacts`.
 */
const META_STRUCTURED_FIELDS = [
  "program",
  "status",
  "tag_ids",
  "tag_names",
] as const;

/**
 * Keys from `FIELD_REGISTRY` whose type is something the planner can express
 * as a structured filter (`select`, `multiselect`, `rating`, `date`). Text
 * fields are excluded — they are searched via evidence instead.
 */
const REGISTRY_STRUCTURED_FIELDS = FIELD_REGISTRY.filter(
  (entry) => entry.type !== "text",
).map((entry) => entry.key);

/**
 * Union of facts-view meta columns and registry-derived non-text fields.
 *
 * Exposed as a readonly array of strings for Zod enum derivation; the
 * registry-derived portion comes straight from the registry so adding a new
 * curated column upstream automatically widens this allowlist. The meta
 * portion is hard-coded because those columns live on the view envelope,
 * not in the per-answer registry.
 */
export const ADMIN_AI_STRUCTURED_FIELDS: readonly string[] = Object.freeze(
  Array.from(
    new Set<string>([
      ...META_STRUCTURED_FIELDS,
      ...REGISTRY_STRUCTURED_FIELDS,
    ]),
  ),
);

/**
 * Array-typed columns in admin_ai_contact_facts. Kept in sync manually with
 * the view definition in supabase/migrations/20260415000001_admin_ai_analyst.sql
 * (look for `tag_ids uuid[]`, `tag_names text[]` in the view body).
 *
 * Used by queryAdminAiContactFacts to route `in`/`contains` filters on these
 * fields through Supabase's `.contains(...)` (array containment) rather than
 * `.in(...)` (scalar list match) or `.ilike(...)` (substring).
 */
export const ADMIN_AI_ARRAY_FACT_FIELDS = Object.freeze([
  "tag_ids",
  "tag_names",
] as const);

export type AdminAiArrayFactField = (typeof ADMIN_AI_ARRAY_FACT_FIELDS)[number];

export function isAdminAiArrayFactField(key: string): key is AdminAiArrayFactField {
  return (ADMIN_AI_ARRAY_FACT_FIELDS as readonly string[]).includes(key);
}

// ---------------------------------------------------------------------------
// Text (evidence) fields
// ---------------------------------------------------------------------------

/**
 * Free-text answer keys searchable via the `admin_ai_evidence_items` view.
 *
 * MUST match the SQL allowlist in
 * `supabase/migrations/20260415000001_admin_ai_analyst.sql` ~lines 394–403.
 * Any change here requires a corresponding migration update (or a new
 * migration) — otherwise the planner can request keys the view does not
 * expose and retrieval will silently drop them.
 */
export const ADMIN_AI_TEXT_FIELDS = [
  "ultimate_vision",
  "inspiration_to_apply",
  "questions_or_concerns",
  "anything_else",
  "current_occupation",
  "filming_equipment",
  "photography_equipment",
  "filmmaking_experience",
  "internship_hopes",
  "candidacy_reason",
] as const;

export type AdminAiTextField = (typeof ADMIN_AI_TEXT_FIELDS)[number];

const ADMIN_AI_TEXT_FIELDS_SET: ReadonlySet<string> = new Set(
  ADMIN_AI_TEXT_FIELDS,
);

const ADMIN_AI_STRUCTURED_FIELDS_SET: ReadonlySet<string> = new Set(
  ADMIN_AI_STRUCTURED_FIELDS,
);

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isAdminAiStructuredField(key: string): boolean {
  return ADMIN_AI_STRUCTURED_FIELDS_SET.has(key);
}

export function isAdminAiTextField(key: string): key is AdminAiTextField {
  return ADMIN_AI_TEXT_FIELDS_SET.has(key);
}

// ---------------------------------------------------------------------------
// Label / option / canonicalization helpers
// ---------------------------------------------------------------------------

/**
 * Returns the human-readable label for a registry field. Falls back to the
 * key itself when the field is unknown to avoid throwing during prompt
 * rendering or UI display.
 */
export function getAdminAiFieldLabel(key: string): string {
  const entry = getFieldEntry(key);
  return entry ? entry.label : key;
}

/**
 * Returns the option list for structured fields. For fields that define a
 * `canonical` override (e.g. `age`, `btm_category`), the canonical option
 * list is returned since that is what filters and AI prompts should compare
 * against. Returns `null` for text fields or unknown keys.
 */
export function getAdminAiFieldOptions(key: string): string[] | null {
  const entry = getFieldEntry(key);
  if (!entry) return null;
  if (entry.type === "text") return null;
  if (entry.canonical) return [...entry.canonical.options];
  return [...entry.options];
}

/**
 * Canonicalizes an option value for a structured field. If the registry
 * entry defines a `canonical.normalize` function, the raw value is routed
 * through it and the normalized bucket (or the original value when
 * normalization returns null) is returned. For fields without
 * canonicalization, the value is returned unchanged.
 */
export function canonicalizeAdminAiOption(key: string, value: string): string {
  const entry = getFieldEntry(key);
  if (!entry || !entry.canonical) return value;
  const normalized = entry.canonical.normalize(value);
  return normalized ?? value;
}

/**
 * Normalizes an option value to its canonical label when the field supports
 * it, otherwise returns the raw trimmed value. Unlike
 * `canonicalizeAdminAiOption`, this helper returns `null` when the raw
 * value cannot be mapped to a canonical bucket for a canonicalized field,
 * letting callers decide how to handle the "Other" case.
 */
export function normalizeAdminAiOption(
  key: string,
  value: string,
): string | null {
  const entry = getFieldEntry(key);
  if (!entry) return value;
  if (entry.canonical) return entry.canonical.normalize(value);
  return value;
}

// Re-export the registry entry type so consumers do not need to reach into
// the admin contacts module directly when they only need field metadata.
export type { FieldRegistryEntry };
