import type { ProgramSlug } from "@/types/database";
import { getFieldEntry } from "./field-registry";

const SAFE_ANSWER_KEY = /^[a-z0-9_]+$/;
const BASE_APPLICATION_COLUMNS = ["id", "contact_id", "program", "submitted_at"];
const REQUIRED_ANSWER_KEYS = ["phone"] as const;

export interface ContactListApplication {
  id: string;
  contact_id: string | null;
  program: ProgramSlug;
  submitted_at: string;
  answers: Record<string, unknown>;
}

export interface ApplicationProjection {
  select: string;
  answerKeys: string[];
}

function unique(items: Iterable<string>): string[] {
  return [...new Set(items)];
}

export function getSafeApplicationAnswerKeys(keys: Iterable<string>): string[] {
  return unique(keys).filter(
    (key) => SAFE_ANSWER_KEY.test(key) && getFieldEntry(key) !== undefined,
  );
}

export function getApplicationProjectionAnswerKeys(
  keys: Iterable<string>,
): string[] {
  return unique([
    ...REQUIRED_ANSWER_KEYS,
    ...getSafeApplicationAnswerKeys(keys),
  ]);
}

export function buildApplicationProjectionSelect(
  keys: Iterable<string>,
): ApplicationProjection {
  const answerKeys = getApplicationProjectionAnswerKeys(keys);
  const answerSelects = answerKeys.map((key) => `ans_${key}:answers->${key}`);

  return {
    answerKeys,
    select: [...BASE_APPLICATION_COLUMNS, ...answerSelects].join(", "),
  };
}

export function reassembleProjectedApplications(
  rows: Array<Record<string, unknown>>,
  answerKeys: Iterable<string>,
): ContactListApplication[] {
  return rows.map((row) => {
    const answers: Record<string, unknown> = {};

    for (const key of answerKeys) {
      const value = row[`ans_${key}`];
      if (value !== null && value !== undefined) {
        answers[key] = value;
      }
    }

    return {
      id: String(row.id),
      contact_id:
        typeof row.contact_id === "string" ? row.contact_id : null,
      program: row.program as ProgramSlug,
      submitted_at: String(row.submitted_at),
      answers,
    };
  });
}

export function mergeProjectedApplicationAnswers(
  previous: ContactListApplication[] | null,
  next: ContactListApplication[],
): ContactListApplication[] {
  const previousById = new Map((previous ?? []).map((app) => [app.id, app]));

  return next.map((app) => {
    const existing = previousById.get(app.id);
    if (!existing) return app;

    return {
      ...existing,
      ...app,
      answers: {
        ...existing.answers,
        ...app.answers,
      },
    };
  });
}

export function getContactsTableApplicationAnswerKeys({
  columnFilters,
  sortBy,
  visibleColumns,
}: {
  columnFilters: Record<string, string[]>;
  sortBy: { key: string } | null;
  visibleColumns: string[];
}): string[] {
  return getSafeApplicationAnswerKeys([
    ...visibleColumns,
    ...Object.keys(columnFilters),
    sortBy?.key ?? "",
  ]);
}
