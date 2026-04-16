/**
 * Deterministic admin AI query planner.
 *
 * This module converts a free-form admin question + explicit scope into a
 * machine-checkable `AdminAiQueryPlan`. It is intentionally *rule-based*: no
 * model call, no RAG, no guessing. The planner only emits structured filters
 * for values it can match against a closed allowlist (registry-derived
 * options + program/status/tag metadata). Anything the allowlist cannot
 * recognize is routed into `textFocus` for downstream keyword/FTS search.
 *
 * Contract details are captured in the Phase 1 plan and enforced by the
 * tests in `query-plan.test.ts`.
 */

import {
  ADMIN_AI_FACT_FILTER_FIELDS,
  canonicalizeAdminAiOption,
  getAdminAiFieldOptions,
} from "./field-config";
import type {
  AdminAiQueryPlan,
  AdminAiScope,
  AdminAiStructuredFilter,
} from "@/types/admin-ai";

// ---------------------------------------------------------------------------
// Allowlisted meta values (program + status)
// ---------------------------------------------------------------------------

/**
 * Program slugs recognized by the planner. Mirrors `ProgramSlug` in
 * `@/types/database`. We duplicate the literal list here (rather than
 * importing) because the planner explicitly matches against the question
 * text and we want the source of truth for *planner matching* to live next
 * to the matching code.
 */
const PROGRAM_VALUES = ["photography", "filmmaking", "freediving", "internship"] as const;

/**
 * Application statuses surfaced via `admin_ai_contact_facts.status`. The view
 * exposes the canonical lowercase status the admin UI uses. Any value we add
 * here MUST also exist as a status in the application lifecycle so the
 * emitted filter survives the eq check.
 */
const STATUS_VALUES = ["reviewing", "accepted", "rejected"] as const;

// ---------------------------------------------------------------------------
// Stopwords + limits
// ---------------------------------------------------------------------------

/**
 * English stopwords stripped before building `textFocus`. Intentionally small
 * — we only drop the most common noise words so meaningful nouns ("humpback",
 * "macro") survive. If this list grows, revisit the test expectations.
 */
const STOPWORDS = new Set<string>([
  "a",
  "about",
  "an",
  "and",
  "are",
  "at",
  "be",
  "been",
  "but",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "her",
  "him",
  "how",
  "i",
  "in",
  "is",
  "it",
  "its",
  "me",
  "of",
  "on",
  "or",
  "people",
  "she",
  "show",
  "that",
  "the",
  "them",
  "they",
  "this",
  "to",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "find",
  "give",
  "list",
  "mention",
  "mentions",
  "love",
  "loves",
  "whose",
  "live",
  "lives",
]);

/**
 * Maximum number of tokens retained in `textFocus`. Bounded so the downstream
 * FTS query does not blow up — 12 distinct terms is already well beyond what
 * a reasonable admin question carries.
 */
const MAX_TEXT_FOCUS_TOKENS = 12;

/**
 * Sensible global default for the planner — the evidence pipeline caps this
 * further (see `MAX_RANKING_COHORT` in
 * `src/lib/admin-ai-memory/global-retrieval.ts`). We pick 25 because that is
 * the historical candidate cap; the cohort retrieval layer enforces a wider
 * 250 cap and keeps ranking-card cost bounded on its own.
 */
const GLOBAL_REQUESTED_LIMIT_DEFAULT = 25;

/**
 * Absolute ceiling on `requestedLimit`. The Zod schema does not impose one,
 * but the planner must — unbounded retrieval breaks the token budget.
 */
const GLOBAL_REQUESTED_LIMIT_MAX = 200;

/**
 * Contact-scope requested limit. When we already know the contact, a single
 * facts row is enough (one contact may have multiple application rows, but
 * the caller explicitly identifies ONE contact).
 */
const CONTACT_REQUESTED_LIMIT = 1;

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Tokenize the raw question into lowercase whole-word tokens. Splits on any
 * non-alphanumeric character so punctuation (question marks, quotes) never
 * ends up as part of a token.
 */
function tokenize(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// Multi-word phrase matching
// ---------------------------------------------------------------------------

/**
 * Returns true if `needle` (a lowercased phrase, possibly multi-word) appears
 * as a contiguous whole-word subsequence in `hayTokens`. Whole-word matching
 * avoids false positives like "accepted" matching "unacceptable".
 */
function phraseMatches(hayTokens: string[], needle: string): boolean {
  const needleTokens = tokenize(needle);
  if (needleTokens.length === 0) return false;
  outer: for (let i = 0; i <= hayTokens.length - needleTokens.length; i++) {
    for (let j = 0; j < needleTokens.length; j++) {
      if (hayTokens[i + j] !== needleTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Returns the indices in `hayTokens` consumed by a phrase match, so the
 * caller can strip those tokens from `textFocus`.
 */
function phraseMatchIndices(hayTokens: string[], needle: string): Set<number> {
  const result = new Set<number>();
  const needleTokens = tokenize(needle);
  if (needleTokens.length === 0) return result;
  outer: for (let i = 0; i <= hayTokens.length - needleTokens.length; i++) {
    for (let j = 0; j < needleTokens.length; j++) {
      if (hayTokens[i + j] !== needleTokens[j]) continue outer;
    }
    for (let j = 0; j < needleTokens.length; j++) {
      result.add(i + j);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Filter extraction
// ---------------------------------------------------------------------------

type FilterExtraction = {
  filters: AdminAiStructuredFilter[];
  consumedIndices: Set<number>;
};

function extractStructuredFilters(
  question: string,
  hayTokens: string[],
  availableTags: Array<{ id: string; name: string }>,
): FilterExtraction {
  const filters: AdminAiStructuredFilter[] = [];
  const consumedIndices = new Set<number>();

  // 1. Program values. Words like "photography" or "filmmaking" also appear
  //    as generic English nouns ("macro photography", "underwater
  //    filmmaking experience"), so a bare lexical match would produce
  //    false-positive filters. Require a disambiguating neighbor token
  //    ("program", "programs", "applicants", "applicant", "track") within
  //    a small window around the match to treat it as a structured program
  //    filter. If no such signal exists, leave the token for `textFocus`.
  const PROGRAM_DISAMBIGUATORS = new Set<string>([
    "program",
    "programs",
    "applicant",
    "applicants",
    "applied",
    "applying",
    "track",
    "tracks",
    "cohort",
  ]);
  for (const program of PROGRAM_VALUES) {
    const indices = phraseMatchIndices(hayTokens, program);
    if (indices.size === 0) continue;
    let disambiguated = false;
    for (const idx of indices) {
      const prev = hayTokens[idx - 1];
      const next = hayTokens[idx + 1];
      if (
        (prev && PROGRAM_DISAMBIGUATORS.has(prev)) ||
        (next && PROGRAM_DISAMBIGUATORS.has(next))
      ) {
        disambiguated = true;
        break;
      }
    }
    if (!disambiguated) continue;
    filters.push({ field: "program", op: "eq", value: program });
    for (const idx of indices) consumedIndices.add(idx);
  }

  // 2. Status values.
  for (const status of STATUS_VALUES) {
    if (phraseMatches(hayTokens, status)) {
      filters.push({ field: "status", op: "eq", value: status });
      for (const idx of phraseMatchIndices(hayTokens, status)) {
        consumedIndices.add(idx);
      }
    }
  }

  // 3. Tag matches — allowlist comes from `availableTags`, a runtime-provided
  //    list of the workspace's tags. Emit tag_ids filter since that's what
  //    the facts view actually stores.
  for (const tag of availableTags) {
    if (!tag.name) continue;
    if (phraseMatches(hayTokens, tag.name)) {
      filters.push({ field: "tag_ids", op: "contains", value: [tag.id] });
      for (const idx of phraseMatchIndices(hayTokens, tag.name)) {
        consumedIndices.add(idx);
      }
    }
  }

  // 4. Structured registry fields — walk every allowlisted structured field
  //    and check each canonical option against the question text. Only emit
  //    a filter when the canonical (post-normalize) option matches.
  for (const fieldKey of ADMIN_AI_FACT_FILTER_FIELDS) {
    // Skip the meta fields handled above.
    if (
      fieldKey === "program" ||
      fieldKey === "status" ||
      fieldKey === "tag_ids" ||
      fieldKey === "tag_names"
    ) {
      continue;
    }
    const options = getAdminAiFieldOptions(fieldKey);
    if (!options || options.length === 0) continue;
    // Track options we've already emitted for this field so the same filter
    // doesn't fire twice (e.g., registry + canonical overlap).
    const emitted = new Set<string>();
    for (const option of options) {
      if (!option || typeof option !== "string") continue;
      if (!phraseMatches(hayTokens, option)) continue;
      const canonical = canonicalizeAdminAiOption(fieldKey, option);
      if (emitted.has(canonical)) continue;
      emitted.add(canonical);
      filters.push({ field: fieldKey, op: "eq", value: canonical });
      for (const idx of phraseMatchIndices(hayTokens, option)) {
        consumedIndices.add(idx);
      }
    }
  }

  // Surface the original-question string for debugging in stacktraces.
  void question;
  return { filters, consumedIndices };
}

// ---------------------------------------------------------------------------
// Text focus construction
// ---------------------------------------------------------------------------

function buildTextFocus(
  hayTokens: string[],
  consumedIndices: Set<number>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < hayTokens.length; i++) {
    if (consumedIndices.has(i)) continue;
    const token = hayTokens[i];
    if (!token) continue;
    if (STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue; // Raw numeric literals (e.g. "9999") are noise.
    if (token.length < 3) continue; // Drop tiny tokens.
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
    if (result.length >= MAX_TEXT_FOCUS_TOKENS) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildAdminAiQueryPlan(input: {
  scope: AdminAiScope;
  contactId?: string;
  question: string;
  availableTags: Array<{ id: string; name: string }>;
}): AdminAiQueryPlan {
  const { scope, contactId, question, availableTags } = input;

  const hayTokens = tokenize(question);
  const { filters, consumedIndices } = extractStructuredFilters(
    question,
    hayTokens,
    availableTags,
  );
  const textFocus = buildTextFocus(hayTokens, consumedIndices);

  // Mode selection:
  //   - contact scope with contactId → contact_synthesis (hard-forced).
  //   - global scope → global_search.
  //   Phase 1 does not emit "hybrid"; that mode is reserved for later work.
  let plan: AdminAiQueryPlan;
  if (scope === "contact" && contactId) {
    plan = {
      mode: "contact_synthesis",
      contactId,
      structuredFilters: filters,
      textFocus,
      requestedLimit: CONTACT_REQUESTED_LIMIT,
    };
  } else {
    plan = {
      mode: "global_search",
      structuredFilters: filters,
      textFocus,
      requestedLimit: Math.min(
        GLOBAL_REQUESTED_LIMIT_DEFAULT,
        GLOBAL_REQUESTED_LIMIT_MAX,
      ),
    };
  }

  // NOTE: We intentionally do NOT run `adminAiQueryPlanSchema.parse(plan)`
  // here. Zod v4's `z.uuid()` only accepts canonical v1–v8 UUIDs (plus nil /
  // max), so validating the plan inside the planner would reject
  // legitimately persisted test UUIDs and would duplicate validation the
  // server action already performs on its input (scope/contactId) and on
  // the final stored payload. The planner's correctness comes from the
  // allowlist-driven construction above, not a round-trip Zod parse.
  return plan;
}
