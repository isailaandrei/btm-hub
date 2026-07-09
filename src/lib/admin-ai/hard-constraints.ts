import type { PlannerOutput } from "./schemas";
import type { ContactCardRecord } from "@/lib/data/contact-cards";
import type { AdminAiResponse } from "@/types/admin-ai";

export type AdminAiHardConstraints = {
  budgetMin?: number;
  /** A tag-category name the question named; members must carry a tag in it. */
  tagCategory?: string;
  /** Other categories the question also matched but that were not applied. */
  otherTagCategories?: string[];
  /**
   * A program name the question named (runtime-derived from `applications.program`);
   * members must have AT LEAST ONE application in this program, any status.
   * Program membership is a hard TAG-CLASS constraint like `tagCategory` — a
   * drop here is definitive (not having applied is never a "maybe") and is
   * never routed through the rescue/evidence path.
   */
  program?: string;
};

export type HardConstraintFilterResult = {
  constraints: AdminAiHardConstraints;
  records: ContactCardRecord[];
  droppedContactIds: string[];
  /** Contacts dropped because their only tag in the category is "Declined". */
  droppedDeclinedContactIds: string[];
  /** Contacts dropped because no application matches the named program. */
  droppedProgramContactIds: string[];
};

const BUDGET_MIN_PATTERNS = [
  /\bbudget\b[^.\n]{0,80}?(\d+(?:[.,]\d+)?)\s*k\b[^.\n]{0,40}?(?:or more|or higher|and up|upwards|plus|\+)/i,
  /\bbudget\b[^.\n]{0,80}?(?:at least|minimum|min|over|above|more than|>=)\s*(?:€|eur|usd|\$)?\s*(\d+(?:[.,]\d+)?)\s*k\b/i,
  /(?:at least|minimum|min|over|above|more than|>=)\s*(?:€|eur|usd|\$)?\s*(\d+(?:[.,]\d+)?)\s*k\b[^.\n]{0,40}?\bbudget\b/i,
] as const;

function parseKAmount(value: string): number {
  return Math.round(Number(value.replace(",", ".")) * 1000);
}

/**
 * A category name is eligible to be matched against the question only if it is
 * distinctive enough to avoid false positives: it must contain a digit OR have
 * at least three words. This lets cohort names like "26 Coral Catch" or
 * "26 Maldives Academy ScubaSpa" match while generic categories such as
 * "Status" or "Interested in" never do.
 */
function isDistinctiveCategoryName(name: string): boolean {
  if (/\d/.test(name)) return true;
  return name.trim().split(/\s+/).length >= 3;
}

function extractTagCategoryConstraint(
  question: string,
  records: ContactCardRecord[],
): Pick<AdminAiHardConstraints, "tagCategory" | "otherTagCategories"> {
  const loweredQuestion = question.toLowerCase();
  const categories = new Set<string>();
  for (const record of records) {
    for (const tag of record.contactTags ?? []) {
      const name = tag.categoryName?.trim();
      if (name && isDistinctiveCategoryName(name)) categories.add(name);
    }
  }
  const matched = [...categories].filter((name) =>
    loweredQuestion.includes(name.toLowerCase()),
  );
  if (matched.length === 0) return {};
  const [tagCategory, ...rest] = matched;
  return {
    tagCategory,
    ...(rest.length > 0 ? { otherTagCategories: rest } : {}),
  };
}

/**
 * Runtime-derived program vocabulary (distinct non-null `applications.program`
 * values across the loaded records) matched against the question the same way
 * `extractTagCategoryConstraint` matches tag categories: a case-insensitive
 * substring hit. Program names ("internship", "freediving", …) are
 * domain-specific single tokens, unlikely to appear incidentally.
 */
function extractProgramConstraint(
  question: string,
  records: ContactCardRecord[],
): Pick<AdminAiHardConstraints, "program"> {
  const loweredQuestion = question.toLowerCase();
  const programs = new Set<string>();
  for (const record of records) {
    for (const application of record.applications) {
      const program = application.program;
      if (typeof program === "string" && program.trim()) {
        programs.add(program.trim());
      }
    }
  }
  const matched = [...programs].find((program) =>
    loweredQuestion.includes(program.toLowerCase()),
  );
  return matched ? { program: matched } : {};
}

export function extractHardConstraints(
  question: string,
  records: ContactCardRecord[] = [],
): AdminAiHardConstraints {
  const constraints: AdminAiHardConstraints = {};
  for (const pattern of BUDGET_MIN_PATTERNS) {
    const rawAmount = question.match(pattern)?.[1];
    if (rawAmount) {
      constraints.budgetMin = parseKAmount(rawAmount);
      break;
    }
  }
  const tag = extractTagCategoryConstraint(question, records);
  if (tag.tagCategory) {
    constraints.tagCategory = tag.tagCategory;
    if (tag.otherTagCategories) {
      constraints.otherTagCategories = tag.otherTagCategories;
    }
  }
  const program = extractProgramConstraint(question, records);
  if (program.program) {
    constraints.program = program.program;
  }
  return constraints;
}

function numericTokenToAmount(
  token: string,
  options: { hasKInToken: boolean; hasKInValue: boolean },
): number | null {
  const normalized = token.replace(/[€$]/g, "").trim();
  if (!normalized) return null;

  let amount: number;
  if (/^\d{1,3}(?:[,.]\d{3})+$/.test(normalized)) {
    amount = Number(normalized.replace(/[,.]/g, ""));
  } else {
    amount = Number(normalized.replace(",", "."));
    if (!Number.isFinite(amount)) return null;
    if (options.hasKInToken || (options.hasKInValue && amount < 100)) {
      amount *= 1000;
    }
  }

  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function extractBudgetAmounts(value: string): number[] {
  const hasKInValue = /\d\s*k\b/i.test(value);
  const amounts: number[] = [];
  const matches = value.matchAll(
    /(?:€|\$)?\s*(\d{1,3}(?:[,.]\d{3})+|\d+(?:[,.]\d+)?)\s*(k)?\b/gi,
  );

  for (const match of matches) {
    const token = match[1];
    if (!token) continue;
    const amount = numericTokenToAmount(token, {
      hasKInToken: Boolean(match[2]),
      hasKInValue,
    });
    if (amount !== null) amounts.push(amount);
  }
  return amounts;
}

export function budgetValueMeetsMinimum(
  value: unknown,
  minimum: number,
): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase();
  if (/\b(?:under|below|less than|limited|no financial means)\b/.test(normalized)) {
    return false;
  }

  const amounts = extractBudgetAmounts(value);
  if (amounts.length === 0) return false;

  if (/[–-]/.test(value) && amounts.length >= 2) {
    return Math.min(...amounts) >= minimum;
  }

  if (/\b(?:over|above|more than|greater than|all-in)\b|>/.test(normalized)) {
    return Math.max(...amounts) >= minimum;
  }

  return amounts.some((amount) => amount >= minimum);
}

function recordMeetsBudgetMinimum(
  record: ContactCardRecord,
  minimum: number,
): boolean {
  for (const application of record.applications) {
    if (budgetValueMeetsMinimum(application.answers?.budget, minimum)) {
      return true;
    }
  }

  for (const fact of record.conversationFacts ?? []) {
    if (
      (fact.fieldKey === "budget" || fact.conflictGroup === "budget") &&
      budgetValueMeetsMinimum(fact.valueText, minimum)
    ) {
      return true;
    }
  }

  return false;
}

function recordTagsInCategory(record: ContactCardRecord, category: string) {
  const target = category.toLowerCase();
  return (record.contactTags ?? []).filter(
    (tag) => tag.categoryName?.toLowerCase() === target,
  );
}

function recordHasTagInCategory(
  record: ContactCardRecord,
  category: string,
): boolean {
  return recordTagsInCategory(record, category).length > 0;
}

// True when the record carries tags in the category and EVERY one is "Declined"
// (case-insensitive). Mixed statuses (e.g. Declined + Interested) return false —
// genuine ambiguity is left to the model.
function recordIsDeclinedOnlyInCategory(
  record: ContactCardRecord,
  category: string,
): boolean {
  const tags = recordTagsInCategory(record, category);
  if (tags.length === 0) return false;
  return tags.every((tag) => (tag.tagName ?? "").toLowerCase() === "declined");
}

function recordHasProgram(record: ContactCardRecord, program: string): boolean {
  const target = program.trim().toLowerCase();
  return record.applications.some(
    (application) => (application.program ?? "").toLowerCase() === target,
  );
}

export function filterRecordsByHardConstraints(
  records: ContactCardRecord[],
  constraints: AdminAiHardConstraints,
): HardConstraintFilterResult {
  const hasBudget = constraints.budgetMin !== undefined;
  const hasTag = constraints.tagCategory !== undefined;
  const hasProgram = constraints.program !== undefined;
  if (!hasBudget && !hasTag && !hasProgram) {
    return {
      constraints,
      records,
      droppedContactIds: [],
      droppedDeclinedContactIds: [],
      droppedProgramContactIds: [],
    };
  }

  // Program membership is applied FIRST and independently, exactly like a tag
  // category: it is a definitive gate (not having an application in the named
  // program is never a "maybe"), so its drops are tracked separately and are
  // NEVER mixed into the budget/tag combined drop list (which the caller may
  // later route through a rescue/evidence path).
  let current = records;
  const droppedProgramContactIds: string[] = [];
  if (hasProgram) {
    const kept: ContactCardRecord[] = [];
    for (const record of current) {
      if (recordHasProgram(record, constraints.program!)) kept.push(record);
      else droppedProgramContactIds.push(record.contact.id);
    }
    current = kept;
  }

  const filtered: ContactCardRecord[] = [];
  const droppedContactIds: string[] = [];
  const droppedDeclinedContactIds: string[] = [];
  for (const record of current) {
    const meetsBudget =
      !hasBudget || recordMeetsBudgetMinimum(record, constraints.budgetMin!);
    const meetsTag =
      !hasTag || recordHasTagInCategory(record, constraints.tagCategory!);
    if (!meetsBudget || !meetsTag) {
      droppedContactIds.push(record.contact.id);
      continue;
    }
    // Known limitation: when a tag category fires, declined-only members are
    // ALWAYS excluded — even for "who declined?" questions (the disclosure
    // points those to the Tags filter). Status semantics deserve a dedicated
    // constraint-planner stage; until then this deterministic rule wins over
    // the prompt instruction the model kept ignoring.
    if (
      hasTag &&
      recordIsDeclinedOnlyInCategory(record, constraints.tagCategory!)
    ) {
      droppedDeclinedContactIds.push(record.contact.id);
      continue;
    }
    filtered.push(record);
  }

  return {
    constraints,
    records: filtered,
    droppedContactIds,
    droppedDeclinedContactIds,
    droppedProgramContactIds,
  };
}

export function applyHardConstraintsToResponse(input: {
  response: AdminAiResponse;
  allowedContactIds: Set<string>;
  constraints: AdminAiHardConstraints;
}): { response: AdminAiResponse; droppedContactIds: string[] } {
  const hasConstraint =
    input.constraints.budgetMin !== undefined ||
    input.constraints.tagCategory !== undefined ||
    input.constraints.program !== undefined;
  if (
    !hasConstraint ||
    (!input.response.shortlist && !input.response.additionalMatches)
  ) {
    return { response: input.response, droppedContactIds: [] };
  }

  // Hard constraints are exclusionary everywhere: drop any shortlist entry OR
  // additional match whose contact was outside the deterministic filters.
  const droppedContactIds: string[] = [];
  const keep = (contactId: string): boolean => {
    if (input.allowedContactIds.has(contactId)) return true;
    droppedContactIds.push(contactId);
    return false;
  };
  const shortlist = input.response.shortlist?.filter((entry) =>
    keep(entry.contactId),
  );
  const additionalMatches = input.response.additionalMatches?.filter((match) =>
    keep(match.contactId),
  );

  if (droppedContactIds.length === 0) {
    return { response: input.response, droppedContactIds };
  }

  const note =
    "Some model-returned shortlist entries were dropped because they were outside deterministic hard filters.";
  return {
    response: {
      ...input.response,
      shortlist,
      additionalMatches,
      uncertainty: input.response.uncertainty.includes(note)
        ? input.response.uncertainty
        : [...input.response.uncertainty, note],
    },
    droppedContactIds,
  };
}

// ---------------------------------------------------------------------------
// Planned constraints (constraint-planner path)
// ---------------------------------------------------------------------------

export type PlannedFilterResult = {
  records: ContactCardRecord[];
  droppedByTag: string[];
  /** Program-cohort drops — like `droppedByTag`, never rescued (see below). */
  droppedByProgram: string[];
  droppedByBudget: string[];
  droppedByField: string[];
};

function fieldValueCandidates(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(fieldValueCandidates);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

function recordFieldValues(record: ContactCardRecord, field: string): string[] {
  const values: string[] = [];
  for (const application of record.applications) {
    const answers = (application.answers ?? {}) as Record<string, unknown>;
    values.push(...fieldValueCandidates(answers[field]));
    // `program` / `status` live on the application envelope, not in `answers`.
    if (field === "program") values.push(...fieldValueCandidates(application.program));
    if (field === "status") values.push(...fieldValueCandidates(application.status));
  }
  return values;
}

/**
 * Normalizes a constraint's value (scalar or array, per the multi-value
 * grounding contract) to a bounded, non-empty list of lowercased targets.
 */
function fieldConstraintTargets(
  constraint: PlannerOutput["fieldConstraints"][number],
): string[] {
  const raw = Array.isArray(constraint.value) ? constraint.value : [constraint.value];
  return raw.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0);
}

/**
 * A record matches when its field value(s) intersect the constraint's value
 * set. Reuses the SAME single-value comparison the pre-multi-value path used
 * (`eq` = exact match, anything else = substring/"contains") for every target,
 * OR'd across both the record's own (possibly multi-valued, e.g. `languages`)
 * answers and the constraint's (possibly multi-valued, e.g. two age buckets)
 * targets — so a scalar constraint against a scalar answer behaves exactly as
 * before.
 */
function recordMatchesFieldConstraint(
  record: ContactCardRecord,
  constraint: PlannerOutput["fieldConstraints"][number],
): boolean {
  const targets = fieldConstraintTargets(constraint);
  if (targets.length === 0) return true;
  const values = recordFieldValues(record, constraint.field);
  return values.some((value) => {
    const lowered = value.toLowerCase();
    return targets.some((target) =>
      constraint.op === "eq" ? lowered === target : lowered.includes(target),
    );
  });
}

function recordMatchesProgramConstraint(
  record: ContactCardRecord,
  program: string,
): boolean {
  const target = program.trim().toLowerCase();
  // Status-agnostic: membership is having AT LEAST ONE application in the
  // program, regardless of that application's status.
  return record.applications.some(
    (application) => (application.program ?? "").toLowerCase() === target,
  );
}

function recordMatchesTagConstraint(
  record: ContactCardRecord,
  tagConstraint: NonNullable<PlannerOutput["tagConstraint"]>,
): boolean {
  const tags = recordTagsInCategory(record, tagConstraint.category);
  if (tags.length === 0) return false;
  if (tagConstraint.includeStatuses.length === 0) {
    // Default when no status is named: any status EXCEPT "Declined" (so a
    // declined-only member is excluded — the current product behavior).
    return tags.some((tag) => (tag.tagName ?? "").toLowerCase() !== "declined");
  }
  const wanted = new Set(
    tagConstraint.includeStatuses.map((status) => status.toLowerCase()),
  );
  return tags.some((tag) => wanted.has((tag.tagName ?? "").toLowerCase()));
}

/**
 * Apply planned constraints sequentially, returning the surviving records plus
 * per-constraint dropped contact-id lists for disclosure. Reuses the same budget
 * comparison as the legacy path.
 */
export function applyPlannedConstraints(
  records: ContactCardRecord[],
  plan: PlannerOutput,
): PlannedFilterResult {
  const droppedByTag: string[] = [];
  const droppedByProgram: string[] = [];
  const droppedByBudget: string[] = [];
  const droppedByField: string[] = [];
  let current = records;

  if (plan.tagConstraint) {
    const tagConstraint = plan.tagConstraint;
    const kept: ContactCardRecord[] = [];
    for (const record of current) {
      if (recordMatchesTagConstraint(record, tagConstraint)) kept.push(record);
      else droppedByTag.push(record.contact.id);
    }
    current = kept;
  }

  // Program membership is a hard TAG-CLASS constraint, applied the same way as
  // `tagConstraint`: sequential, and its drops are tracked separately so the
  // caller (orchestrator.ts) never routes them into the rescue pool — not
  // having applied to a program is definitive, unlike a field/budget mismatch
  // that other evidence might override.
  if (plan.programConstraint) {
    const programConstraint = plan.programConstraint;
    const kept: ContactCardRecord[] = [];
    for (const record of current) {
      if (recordMatchesProgramConstraint(record, programConstraint)) kept.push(record);
      else droppedByProgram.push(record.contact.id);
    }
    current = kept;
  }

  if (plan.budgetMin !== null) {
    const budgetMin = plan.budgetMin;
    const kept: ContactCardRecord[] = [];
    for (const record of current) {
      if (recordMeetsBudgetMinimum(record, budgetMin)) kept.push(record);
      else droppedByBudget.push(record.contact.id);
    }
    current = kept;
  }

  for (const constraint of plan.fieldConstraints) {
    const kept: ContactCardRecord[] = [];
    for (const record of current) {
      if (recordMatchesFieldConstraint(record, constraint)) kept.push(record);
      else droppedByField.push(record.contact.id);
    }
    current = kept;
  }

  return {
    records: current,
    droppedByTag,
    droppedByProgram,
    droppedByBudget,
    droppedByField,
  };
}

/**
 * Response safety net shared by both prefilter paths: drop any shortlist OR
 * additionalMatches entry whose contact was filtered out (the model should only
 * have seen allowed cards, but this enforces it defensively).
 */
export function filterResponseToAllowedContacts(
  response: AdminAiResponse,
  allowedContactIds: Set<string>,
): { response: AdminAiResponse; droppedContactIds: string[] } {
  const droppedContactIds: string[] = [];
  const keep = (contactId: string): boolean => {
    if (allowedContactIds.has(contactId)) return true;
    droppedContactIds.push(contactId);
    return false;
  };
  const shortlist = response.shortlist?.filter((entry) => keep(entry.contactId));
  const additionalMatches = response.additionalMatches?.filter((match) =>
    keep(match.contactId),
  );
  if (droppedContactIds.length === 0) return { response, droppedContactIds };
  return {
    response: { ...response, shortlist, additionalMatches },
    droppedContactIds,
  };
}
