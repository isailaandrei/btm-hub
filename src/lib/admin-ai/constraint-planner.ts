/**
 * Constraint planner — a tiny planning LLM call that translates a question into
 * validated, exclusionary structured constraints. CODE then applies them
 * (`applyPlannedConstraints` in hard-constraints.ts). This is the general
 * mechanism that retires the hand-rolled budget-regex / tag-substring /
 * declined-only heuristics; on ANY failure the caller falls back to those legacy
 * filters (the single sanctioned, disclosed degraded mode).
 */
import {
  ADMIN_AI_STRUCTURED_FIELDS,
  getAdminAiFieldLabel,
  getAdminAiFieldOptions,
} from "./field-config";
import { plannerOutputSchema, type PlannerOutput } from "./schemas";
import type { AdminAiProvider } from "./provider";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

// Tag membership is expressed via `tagConstraint`, not field filters, so the tag
// meta columns are excluded from the planner's field catalog.
const NON_FIELD_META_KEYS = new Set(["tag_ids", "tag_names"]);

// Per list-valued field, how many observed distinct values to sample into the
// catalog (top N by frequency). Bounds the planner payload while covering the
// common values the planner needs to ground a `contains` filter (e.g. a language).
const LIST_FIELD_SAMPLE_SIZE = 30;

export type PlannerCatalogField = {
  key: string;
  label: string;
  /** Complete option list for an option-backed field (`eq`/`contains`). */
  options?: string[];
  /** Supported op for a list-valued field (discrete array answers). */
  op?: "contains";
  /** Bounded sample of observed values for a list-valued field. */
  values?: string[];
};

export type PlannerCatalog = {
  tagCategories: Array<{ name: string; tags: string[] }>;
  fields: PlannerCatalogField[];
  /**
   * Distinct non-null `applications.program` values observed in the loaded
   * corpus, derived AT RUNTIME (never hardcoded — new programs appear without
   * a code change). Grounds `programConstraint`: a program-cohort question
   * ("internship applicants", "who applied to freediving") maps to this
   * vocabulary, matched whole-item, case-insensitive, exactly like a tag
   * category/status.
   */
  programs: string[];
};

function stringifyListItem(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * Data-driven admission of LIST-VALUED answer fields: any answer key whose value
 * is an array in at least one loaded record. Discrete array answers (e.g.
 * `languages`) are a controlled vocabulary, not prose, so a case-insensitive
 * `contains` over their items is precise — unlike a paraphrase-blind substring
 * over an essay. Each admitted field carries a bounded top-frequency value
 * sample so the planner can ground values like "Spanish".
 */
function collectListValuedFields(
  records: ContactCardRecord[],
  excludeKeys: ReadonlySet<string>,
): PlannerCatalogField[] {
  const frequencyByKey = new Map<string, Map<string, number>>();
  for (const record of records) {
    for (const application of record.applications) {
      const answers = (application.answers ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(answers)) {
        if (!Array.isArray(value)) continue;
        if (excludeKeys.has(key) || NON_FIELD_META_KEYS.has(key)) continue;
        let counts = frequencyByKey.get(key);
        if (!counts) {
          counts = new Map<string, number>();
          frequencyByKey.set(key, counts);
        }
        for (const item of value) {
          const stringified = stringifyListItem(item);
          if (!stringified) continue;
          counts.set(stringified, (counts.get(stringified) ?? 0) + 1);
        }
      }
    }
  }

  const fields: PlannerCatalogField[] = [];
  for (const [key, counts] of frequencyByKey) {
    const values = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, LIST_FIELD_SAMPLE_SIZE)
      .map(([value]) => value);
    if (values.length === 0) continue;
    fields.push({ key, label: getAdminAiFieldLabel(key), op: "contains", values });
  }
  return fields;
}

/**
 * Runtime-derived program vocabulary: distinct non-null, non-empty
 * `applications.program` values across the loaded corpus, sorted for a stable
 * catalog payload (prompt-cache friendly). Program membership is a hard
 * TAG-CLASS constraint — not having an application in a program is
 * definitive, so this vocabulary is never sampled/truncated the way list-field
 * values are.
 */
function collectProgramVocabulary(records: ContactCardRecord[]): string[] {
  const programs = new Set<string>();
  for (const record of records) {
    for (const application of record.applications) {
      const program = application.program;
      if (typeof program === "string" && program.trim()) {
        programs.add(program.trim());
      }
    }
  }
  return [...programs].sort();
}

export function buildPlannerCatalog(records: ContactCardRecord[]): PlannerCatalog {
  const tagsByCategory = new Map<string, Set<string>>();
  for (const record of records) {
    for (const tag of record.contactTags ?? []) {
      const category = tag.categoryName?.trim();
      const name = tag.tagName?.trim();
      if (!category || !name) continue;
      let set = tagsByCategory.get(category);
      if (!set) {
        set = new Set<string>();
        tagsByCategory.set(category, set);
      }
      set.add(name);
    }
  }
  const tagCategories = [...tagsByCategory.entries()].map(([name, tags]) => ({
    name,
    tags: [...tags],
  }));

  // Two admission paths, both exclusionary-safe:
  // 1. OPTION-BACKED fields (a fixed option list) — `eq`/`contains` over options.
  // 2. LIST-VALUED fields (discrete array answers, e.g. `languages`) — `contains`
  //    over a bounded value sample.
  // Free-text prose fields (essays, single-string answers) are still omitted —
  // paraphrase-blind substring filters over prose destroy recall, so those
  // criteria are left to the evidence scan.
  const optionFields = ADMIN_AI_STRUCTURED_FIELDS.filter(
    (key) => !NON_FIELD_META_KEYS.has(key),
  )
    .map((key) => ({
      key,
      label: getAdminAiFieldLabel(key),
      options: getAdminAiFieldOptions(key),
    }))
    .filter(
      (field): field is { key: string; label: string; options: string[] } =>
        Array.isArray(field.options) && field.options.length > 0,
    );
  const optionFieldKeys = new Set(optionFields.map((field) => field.key));
  const listFields = collectListValuedFields(records, optionFieldKeys);

  return {
    tagCategories,
    fields: [...optionFields, ...listFields],
    programs: collectProgramVocabulary(records),
  };
}

export function buildPlannerSystemPrompt(): string {
  return [
    "You are a query-constraint planner for a CRM admin AI.",
    "Extract ONLY the constraints the question makes EXPLICIT and exclusionary. When a detail is a ranking preference, a nice-to-have, or unstated, it is NOT a constraint.",
    "Use ONLY category names, tag names, field keys, and program names that appear in the supplied catalog, copied verbatim (exact casing). Never invent names.",
    'Output valid JSON matching this contract: {"tagConstraint": {"category": "string", "includeStatuses": ["string"]} | null, "programConstraint": "string" | null, "budgetMin": number | null, "fieldConstraints": [{"field": "string", "op": "contains" | "eq", "value": "string" | ["string"]}], "enumerationOnly": boolean, "notes": "string"}.',
    'Tag rules: "interested / potential candidates for X" → includeStatuses ["Interested","Potential Candidate"]; "who is joining X" → ["Joining"]; "who declined X" → ["Declined"]; a cohort named with NO status qualifier → includeStatuses [] (code applies the default).',
    'Program rules: when the question names a program cohort — "X applicants", "X candidates", "people who applied to X", "the X program" — for an X that is one of the catalog\'s `programs` values, set `programConstraint` to that program copied VERBATIM from `programs`. Program membership means the contact has an application in that program, independent of its status. Do NOT set programConstraint for a program mentioned only incidentally (e.g. comparing programs) or for a value not present in `programs`.',
    "Budget: set budgetMin only when the question states an explicit minimum spend.",
    'Field constraints: emit one ONLY for a catalog field. Each value MUST be one of that field\'s listed `options` (option-backed) or `values` (list-valued) items copied VERBATIM IN FULL — e.g. emit "Advanced Freediver", never "advanced"; emit "Professional video camera", never "professional". A word or fragment that merely appears inside a longer item does NOT ground a constraint. If no listed item expresses the user\'s criterion, emit NO constraint — the evidence scan handles it.',
    'When a question\'s criterion spans MULTIPLE options of the SAME field — an age range crossing more than one bucket ("aged 20 to 30"), several nationalities, several equipment items — list ALL matching options verbatim as a JSON array in `value` (e.g. `["18-24","25-34"]`), never just one. Emitting only the first matching option silently narrows the cohort. Use a single string `value` only when exactly one option applies. Always use `op: "contains"` regardless of whether `value` is a string or an array.',
    "Quality adjectives and level qualifiers — professional, experienced, advanced, good, high-end, serious, strong, and the like — are NEVER field-constraint values. A requirement phrased as a QUALITY of something (e.g. 'professional equipment', 'extensive experience', 'own their own professional gear') is a ranking/judgment criterion for the analyst, not a filter — leave it out even if the word appears inside a catalog vocabulary item.",
    "Criteria described only in prose — topics, experiences, anything narrated in essay answers — are NOT constraints; the evidence scan handles them. Catalog fields (option-backed or list-valued) are the ONLY fields you may filter on; never emit a fieldConstraint for a field absent from the catalog.",
    "Ranking preferences such as 'most experienced' or 'strongest' are NOT constraints — leave them out.",
    "Set `enumerationOnly` true when the question asks for an exhaustive roster of the extracted constraints and nothing more — whether the constraint is a tag cohort (e.g. 'who is interested / potential for X?'), a program cohort (e.g. 'list the internship applicants'), or a catalog field (e.g. 'which contacts speak Spanish?', 'list everyone certified as X'). Set it false when the question adds ranking or judgment beyond the constraints (e.g. 'who in X has the most experience?', 'the internship applicants with the most experience above water').",
    "When the question names nothing explicit and exclusionary, return tagConstraint null, programConstraint null, budgetMin null, an empty fieldConstraints array, and enumerationOnly false.",
    "Put a one-line explanation of your reading in `notes`.",
  ].join(" ");
}

export function buildPlannerUserPrompt(input: {
  catalog: PlannerCatalog;
  question: string;
}): string {
  // Catalog FIRST (large, stable), question LAST (per-question tail) so the
  // planner call is prefix-cache friendly, same trick as the synthesis prompt.
  return JSON.stringify(
    { catalog: input.catalog, question: input.question },
    null,
    2,
  );
}

function describeConstraintValue(value: string | string[]): string {
  return Array.isArray(value) ? `[${value.join(", ")}]` : value;
}

/**
 * Drop any constraint referencing a category/tag/field not in the catalog
 * (case-insensitive match, canonical casing kept). Returns the cleaned plan and
 * a human-readable list of dropped parts for disclosure.
 */
export function validatePlan(
  plan: PlannerOutput,
  catalog: PlannerCatalog,
): { plan: PlannerOutput; droppedParts: string[] } {
  const droppedParts: string[] = [];

  let tagConstraint = plan.tagConstraint;
  if (tagConstraint) {
    const category = catalog.tagCategories.find(
      (c) => c.name.toLowerCase() === tagConstraint!.category.toLowerCase(),
    );
    if (!category) {
      droppedParts.push(`tag category '${tagConstraint.category}' (unknown)`);
      tagConstraint = null;
    } else {
      const includeStatuses: string[] = [];
      for (const status of tagConstraint.includeStatuses) {
        const canonical = category.tags.find(
          (t) => t.toLowerCase() === status.toLowerCase(),
        );
        if (canonical) includeStatuses.push(canonical);
        else droppedParts.push(`status '${status}' in '${category.name}' (unknown)`);
      }
      tagConstraint = { category: category.name, includeStatuses };
    }
  }

  // Program constraint: the SAME whole-vocabulary-item rule as tags/fields, but
  // grounded against the runtime-derived `catalog.programs` list. A drop here
  // is disclosed with the same message shape used for field constraints so the
  // caller's existing "not an exact vocabulary item" detection keeps working.
  let programConstraint = plan.programConstraint;
  if (programConstraint) {
    const normalized = programConstraint.trim().toLowerCase();
    const canonical = catalog.programs.find(
      (program) => program.trim().toLowerCase() === normalized,
    );
    if (canonical) {
      programConstraint = canonical;
    } else {
      droppedParts.push(
        `program constraint '${programConstraint}' dropped: not an exact vocabulary item of 'program'`,
      );
      programConstraint = null;
    }
  }

  const fieldConstraints: PlannerOutput["fieldConstraints"] = [];
  for (const constraint of plan.fieldConstraints) {
    const field = catalog.fields.find(
      (f) => f.key.toLowerCase() === constraint.field.toLowerCase(),
    );
    if (!field) {
      const label = `field filter '${constraint.field} ${constraint.op} ${describeConstraintValue(constraint.value)}'`;
      droppedParts.push(
        `${label} dropped: field is free-text or unknown — left to the evidence scan`,
      );
      continue;
    }
    // ONE grounding rule for both field kinds: EACH value must trim/case-
    // insensitively EQUAL a WHOLE vocabulary item — an option (option-backed) or
    // a sampled item (list-valued). Substring grounding is unsound: the quality
    // word "professional" is a substring of the option "Professional video
    // camera" yet is a ranking judgment, not set membership; grounding it as a
    // hard filter silently drops qualifying contacts. The planner (which sees the
    // full option list) is responsible for copying whole items verbatim — e.g.
    // "Advanced Freediver", never "advanced" — or emitting no constraint. Apply-
    // time matching in hard-constraints.ts stays `contains`/`in` so legacy
    // string-typed answers keep matching; only validation is exact here.
    //
    // A question can span MULTIPLE vocabulary items of the same field (an age
    // range crossing buckets, several nationalities, several equipment items).
    // Each array item is graded independently: invalid items are dropped (and
    // disclosed) individually, never the whole constraint — the constraint stays
    // as wide as whatever validly grounded (never narrower).
    const vocabulary = field.options ?? field.values ?? [];
    const rawValues = Array.isArray(constraint.value)
      ? constraint.value
      : [constraint.value];
    const survivingValues: string[] = [];
    for (const rawValue of rawValues) {
      const normalized = rawValue.trim().toLowerCase();
      const matchesItem = vocabulary.some(
        (item) => item.trim().toLowerCase() === normalized,
      );
      if (matchesItem) {
        survivingValues.push(rawValue);
      } else {
        droppedParts.push(
          `field filter '${constraint.field} ${constraint.op} ${rawValue}' dropped: '${rawValue}' is not an exact vocabulary item of '${field.key}'`,
        );
      }
    }
    if (survivingValues.length === 0) continue;
    // Normalize the apply-time op regardless of what the planner emitted.
    // Validation already forced every surviving VALUE to be a whole vocabulary
    // item, so `contains` (single value) / `in` (multiple values) at apply time
    // is a strictly safe superset of `eq`: it also catches that canonical item
    // embedded in legacy/Other-shaped stored values (free-text "Other" entries,
    // comma-joined legacy language strings) that an exact `eq` comparison would
    // miss — silently excluding qualifying contacts.
    fieldConstraints.push({
      field: field.key,
      op: survivingValues.length > 1 ? "in" : "contains",
      value: survivingValues.length > 1 ? survivingValues : survivingValues[0]!,
    });
  }

  return {
    plan: { ...plan, tagConstraint, programConstraint, fieldConstraints },
    droppedParts,
  };
}

export type PlannerRun = {
  plan: PlannerOutput;
  catalog: PlannerCatalog;
  droppedParts: string[];
};

/**
 * Run the planner via `provider.completeJson` (thinking is always disabled there).
 * Returns `null` on ANY failure — missing completeJson, call/network error, or
 * JSON/zod failure — so the caller can fall back to the legacy path with a
 * disclosed note (fail loud, one sanctioned degraded mode).
 */
export async function runConstraintPlanner(input: {
  provider: AdminAiProvider;
  records: ContactCardRecord[];
  question: string;
}): Promise<PlannerRun | null> {
  const { provider, records, question } = input;
  if (!provider.completeJson) return null;

  const catalog = buildPlannerCatalog(records);
  try {
    const { json } = await provider.completeJson({
      systemPrompt: buildPlannerSystemPrompt(),
      userPrompt: buildPlannerUserPrompt({ catalog, question }),
      scope: "global",
    });
    const parsed = plannerOutputSchema.safeParse(json);
    if (!parsed.success) return null;
    const { plan, droppedParts } = validatePlan(parsed.data, catalog);
    return { plan, catalog, droppedParts };
  } catch {
    return null;
  }
}

export function planHasConstraints(plan: PlannerOutput): boolean {
  return (
    plan.tagConstraint !== null ||
    plan.programConstraint !== null ||
    plan.budgetMin !== null ||
    plan.fieldConstraints.length > 0
  );
}
