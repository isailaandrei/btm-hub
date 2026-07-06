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

  return { tagCategories, fields: [...optionFields, ...listFields] };
}

export function buildPlannerSystemPrompt(): string {
  return [
    "You are a query-constraint planner for a CRM admin AI.",
    "Extract ONLY the constraints the question makes EXPLICIT and exclusionary. When a detail is a ranking preference, a nice-to-have, or unstated, it is NOT a constraint.",
    "Use ONLY category names, tag names, and field keys that appear in the supplied catalog, copied verbatim (exact casing). Never invent names.",
    'Output valid JSON matching this contract: {"tagConstraint": {"category": "string", "includeStatuses": ["string"]} | null, "budgetMin": number | null, "fieldConstraints": [{"field": "string", "op": "contains" | "eq", "value": "string"}], "enumerationOnly": boolean, "notes": "string"}.',
    'Tag rules: "interested / potential candidates for X" → includeStatuses ["Interested","Potential Candidate"]; "who is joining X" → ["Joining"]; "who declined X" → ["Declined"]; a cohort named with NO status qualifier → includeStatuses [] (code applies the default).',
    "Budget: set budgetMin only when the question states an explicit minimum spend.",
    'Field constraints: emit one ONLY for a catalog field. For an option-backed field (one carrying `options`), use `eq` for an exact option and `contains` for a substring of an option. For a list-valued field (one carrying `op: "contains"` and a `values` sample, e.g. languages), emit `op: "contains"` with a single value grounded in that sample (e.g. "Spanish").',
    "Criteria described only in prose — topics, experiences, anything narrated in essay answers — are NOT constraints; the evidence scan handles them. Catalog fields (option-backed or list-valued) are the ONLY fields you may filter on; never emit a fieldConstraint for a field absent from the catalog.",
    "Ranking preferences such as 'most experienced' or 'strongest' are NOT constraints — leave them out.",
    "Set `enumerationOnly` true when the question asks for an exhaustive roster of the extracted constraints and nothing more — whether the constraint is a tag cohort (e.g. 'who is interested / potential for X?') or a catalog field (e.g. 'which contacts speak Spanish?', 'list everyone certified as X'). Set it false when the question adds ranking or judgment beyond the constraints (e.g. 'who in X has the most experience?').",
    "When the question names nothing explicit and exclusionary, return tagConstraint null, budgetMin null, an empty fieldConstraints array, and enumerationOnly false.",
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

  const fieldConstraints: PlannerOutput["fieldConstraints"] = [];
  for (const constraint of plan.fieldConstraints) {
    const label = `field filter '${constraint.field} ${constraint.op} ${constraint.value}'`;
    const field = catalog.fields.find(
      (f) => f.key.toLowerCase() === constraint.field.toLowerCase(),
    );
    if (!field) {
      droppedParts.push(
        `${label} dropped: field is free-text or unknown — left to the evidence scan`,
      );
      continue;
    }
    // The value must case-insensitively match one of the field's grounded values
    // — an option (option-backed field) or a sampled observed value (list-valued
    // field), exact or as a substring. Otherwise it is not a real filter and the
    // evidence scan should handle it.
    const value = constraint.value.trim().toLowerCase();
    const candidateValues = field.options ?? field.values ?? [];
    const matchesValue = candidateValues.some((candidate) =>
      candidate.toLowerCase().includes(value),
    );
    if (!matchesValue) {
      droppedParts.push(
        `${label} dropped: '${constraint.value}' is not a recognized value of '${field.key}'`,
      );
      continue;
    }
    fieldConstraints.push({ ...constraint, field: field.key });
  }

  return { plan: { ...plan, tagConstraint, fieldConstraints }, droppedParts };
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
    plan.budgetMin !== null ||
    plan.fieldConstraints.length > 0
  );
}
