import type { Application, Contact } from "@/types/database";
import type { FieldRegistryEntry } from "./field-registry";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection };

type SortValue = string | number | null;

/** Column keys for contact-level fields not backed by the FIELD_REGISTRY. */
export const BUILTIN_COLUMN = {
  name: "name",
  email: "email",
  phone: "phone",
  submittedAt: "submitted_at",
} as const;

/** Extract the sortable value for a contact at a given column. Null sorts
 *  last regardless of direction (enforced by `compareContacts`). */
export function getSortValue(
  contact: Contact,
  key: string,
  appsByContact: Map<string, Application[]>,
  field: FieldRegistryEntry | undefined,
): SortValue {
  switch (key) {
    case BUILTIN_COLUMN.name:
      return contact.name.toLocaleLowerCase();
    case BUILTIN_COLUMN.email:
      return contact.email.toLocaleLowerCase();
    case BUILTIN_COLUMN.phone:
      return contact.phone ?? null;
    case BUILTIN_COLUMN.submittedAt: {
      const apps = appsByContact.get(contact.id);
      return apps?.[0]?.submitted_at ?? null;
    }
  }

  if (!field) return null;
  const firstApp = appsByContact.get(contact.id)?.[0];
  if (!firstApp) return null;
  const raw = firstApp.answers[key];
  if (raw == null) return null;

  if (field.type === "rating") {
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : null;
  }

  if (field.type === "date") {
    const parsed = Date.parse(String(raw));
    return Number.isFinite(parsed) ? parsed : null;
  }

  // select / multiselect — pick the first value, optionally normalize,
  // then sort by canonical option index (values outside the list sort last).
  // For multiselect, only the first element contributes to ordering; later
  // elements still render in the cell but don't affect sort position. Kept
  // simple to keep the comparator stable and cheap.
  const firstValue = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw);
  if (firstValue === "") return null;
  const normalized = field.canonical?.normalize(firstValue) ?? firstValue;
  const optionList = (field.canonical?.options ??
    field.options) as readonly string[];
  const idx = optionList.indexOf(normalized as string);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

/**
 * Compare two contacts for `Array.sort`. Null values always sort LAST,
 * regardless of direction — UX convention for "incomplete" rows.
 */
export function compareContacts(
  a: Contact,
  b: Contact,
  sortBy: SortState,
  appsByContact: Map<string, Application[]>,
  field: FieldRegistryEntry | undefined,
): number {
  const valA = getSortValue(a, sortBy.key, appsByContact, field);
  const valB = getSortValue(b, sortBy.key, appsByContact, field);

  // Null-last regardless of direction.
  if (valA === null && valB === null) return 0;
  if (valA === null) return 1;
  if (valB === null) return -1;

  const cmp =
    typeof valA === "number" && typeof valB === "number"
      ? valA - valB
      : String(valA).localeCompare(String(valB));
  return sortBy.direction === "asc" ? cmp : -cmp;
}
