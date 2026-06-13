export const CONTACTS_TABLE_PAGE_SIZES = [25, 50, 150] as const;

export type ContactsTablePageSize = (typeof CONTACTS_TABLE_PAGE_SIZES)[number];

export type ContactsTableSort = {
  key: string;
  direction: "asc" | "desc";
};

export type ContactsTablePreferences = {
  visible_columns?: string[];
  previously_selected_columns?: string[];
  sort_by?: ContactsTableSort | null;
  page_size?: ContactsTablePageSize;
};

export type ContactsPreferencesPatch = {
  contacts_table?: ContactsTablePreferences;
};

const CONTACTS_TABLE_PREFERENCE_KEYS = new Set([
  "visible_columns",
  "previously_selected_columns",
  "sort_by",
  "page_size",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isContactsTableSort(value: unknown): value is ContactsTableSort {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    (value.direction === "asc" || value.direction === "desc")
  );
}

function isContactsTablePageSize(
  value: unknown,
): value is ContactsTablePageSize {
  return (CONTACTS_TABLE_PAGE_SIZES as readonly unknown[]).includes(value);
}

export function readContactsTablePreferences(
  preferences: Record<string, unknown>,
): ContactsTablePreferences {
  const raw = preferences.contacts_table;
  if (!isRecord(raw)) return {};
  if (
    !Object.keys(raw).every((key) => CONTACTS_TABLE_PREFERENCE_KEYS.has(key))
  ) {
    return {};
  }

  const result: ContactsTablePreferences = {};

  if (raw.visible_columns !== undefined) {
    if (!isStringArray(raw.visible_columns)) return {};
    result.visible_columns = raw.visible_columns;
  }

  if (raw.previously_selected_columns !== undefined) {
    if (!isStringArray(raw.previously_selected_columns)) return {};
    result.previously_selected_columns = raw.previously_selected_columns;
  }

  if (raw.sort_by !== undefined) {
    if (raw.sort_by !== null && !isContactsTableSort(raw.sort_by)) return {};
    result.sort_by =
      raw.sort_by === null
        ? null
        : { key: raw.sort_by.key, direction: raw.sort_by.direction };
  }

  if (raw.page_size !== undefined) {
    if (!isContactsTablePageSize(raw.page_size)) return {};
    result.page_size = raw.page_size;
  }

  return result;
}

export function mergeContactsTablePreferencePatch(
  existingPreferences: Record<string, unknown>,
  patch: ContactsPreferencesPatch,
): ContactsPreferencesPatch {
  if (!patch.contacts_table) return patch;

  const existingContactsTable = isRecord(existingPreferences.contacts_table)
    ? existingPreferences.contacts_table
    : {};

  return {
    ...patch,
    contacts_table: {
      ...existingContactsTable,
      ...patch.contacts_table,
    },
  };
}
