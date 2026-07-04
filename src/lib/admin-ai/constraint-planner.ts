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

export type PlannerCatalog = {
  tagCategories: Array<{ name: string; tags: string[] }>;
  fields: Array<{ key: string; label: string; options?: string[] }>;
};

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

  const fields = ADMIN_AI_STRUCTURED_FIELDS.filter(
    (key) => !NON_FIELD_META_KEYS.has(key),
  ).map((key) => {
    const options = getAdminAiFieldOptions(key);
    return {
      key,
      label: getAdminAiFieldLabel(key),
      ...(options && options.length > 0 ? { options } : {}),
    };
  });

  return { tagCategories, fields };
}

export function buildPlannerSystemPrompt(): string {
  return [
    "You are a query-constraint planner for a CRM admin AI.",
    "Extract ONLY the constraints the question makes EXPLICIT and exclusionary. When a detail is a ranking preference, a nice-to-have, or unstated, it is NOT a constraint.",
    "Use ONLY category names, tag names, and field keys that appear in the supplied catalog, copied verbatim (exact casing). Never invent names.",
    'Output valid JSON matching this contract: {"tagConstraint": {"category": "string", "includeStatuses": ["string"]} | null, "budgetMin": number | null, "fieldConstraints": [{"field": "string", "op": "contains" | "eq", "value": "string"}], "notes": "string"}.',
    'Tag rules: "interested / potential candidates for X" → includeStatuses ["Interested","Potential Candidate"]; "who is joining X" → ["Joining"]; "who declined X" → ["Declined"]; a cohort named with NO status qualifier → includeStatuses [] (code applies the default).',
    "Budget: set budgetMin only when the question states an explicit minimum spend.",
    "Field constraints: emit one only when the question demands a specific value of a catalog field; use `eq` for an exact option and `contains` for a substring.",
    "Ranking preferences such as 'most experienced' or 'strongest' are NOT constraints — leave them out.",
    "When the question names nothing explicit and exclusionary, return tagConstraint null, budgetMin null, and an empty fieldConstraints array.",
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
    const field = catalog.fields.find(
      (f) => f.key.toLowerCase() === constraint.field.toLowerCase(),
    );
    if (!field) {
      droppedParts.push(`field '${constraint.field}' (unknown)`);
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
