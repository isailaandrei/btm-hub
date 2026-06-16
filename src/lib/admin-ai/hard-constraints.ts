import type { ContactCardRecord } from "@/lib/data/contact-cards";
import type { AdminAiResponse } from "@/types/admin-ai";

export type AdminAiHardConstraints = {
  budgetMin?: number;
};

export type HardConstraintFilterResult = {
  constraints: AdminAiHardConstraints;
  records: ContactCardRecord[];
  droppedContactIds: string[];
};

const BUDGET_MIN_PATTERNS = [
  /\bbudget\b[^.\n]{0,80}?(\d+(?:[.,]\d+)?)\s*k\b[^.\n]{0,40}?(?:or more|or higher|and up|upwards|plus|\+)/i,
  /\bbudget\b[^.\n]{0,80}?(?:at least|minimum|min|over|above|more than|>=)\s*(?:€|eur|usd|\$)?\s*(\d+(?:[.,]\d+)?)\s*k\b/i,
  /(?:at least|minimum|min|over|above|more than|>=)\s*(?:€|eur|usd|\$)?\s*(\d+(?:[.,]\d+)?)\s*k\b[^.\n]{0,40}?\bbudget\b/i,
] as const;

function parseKAmount(value: string): number {
  return Math.round(Number(value.replace(",", ".")) * 1000);
}

export function extractHardConstraints(question: string): AdminAiHardConstraints {
  for (const pattern of BUDGET_MIN_PATTERNS) {
    const match = question.match(pattern);
    const rawAmount = match?.[1];
    if (!rawAmount) continue;
    return { budgetMin: parseKAmount(rawAmount) };
  }
  return {};
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

export function filterRecordsByHardConstraints(
  records: ContactCardRecord[],
  constraints: AdminAiHardConstraints,
): HardConstraintFilterResult {
  if (constraints.budgetMin === undefined) {
    return { constraints, records, droppedContactIds: [] };
  }

  const filtered: ContactCardRecord[] = [];
  const droppedContactIds: string[] = [];
  for (const record of records) {
    if (recordMeetsBudgetMinimum(record, constraints.budgetMin)) {
      filtered.push(record);
    } else {
      droppedContactIds.push(record.contact.id);
    }
  }

  return { constraints, records: filtered, droppedContactIds };
}

export function applyHardConstraintsToResponse(input: {
  response: AdminAiResponse;
  allowedContactIds: Set<string>;
  constraints: AdminAiHardConstraints;
}): { response: AdminAiResponse; droppedContactIds: string[] } {
  if (input.constraints.budgetMin === undefined || !input.response.shortlist) {
    return { response: input.response, droppedContactIds: [] };
  }

  const droppedContactIds: string[] = [];
  const shortlist = input.response.shortlist.filter((entry) => {
    if (input.allowedContactIds.has(entry.contactId)) return true;
    droppedContactIds.push(entry.contactId);
    return false;
  });

  if (droppedContactIds.length === 0) {
    return { response: input.response, droppedContactIds };
  }

  const note =
    "Some model-returned shortlist entries were dropped because they were outside deterministic hard filters.";
  return {
    response: {
      ...input.response,
      shortlist,
      uncertainty: input.response.uncertainty.includes(note)
        ? input.response.uncertainty
        : [...input.response.uncertainty, note],
    },
    droppedContactIds,
  };
}
