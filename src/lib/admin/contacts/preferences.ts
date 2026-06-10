import { z } from "zod/v4";

export const CONTACTS_TABLE_PAGE_SIZES = [25, 50, 150] as const;

const contactsTablePageSizeSchema = z.union([
  z.literal(25),
  z.literal(50),
  z.literal(150),
]);

export const contactsTableSortSchema = z.object({
  key: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});

export const contactsTablePreferencesSchema = z
  .object({
    visible_columns: z.array(z.string()).optional(),
    previously_selected_columns: z.array(z.string()).optional(),
    sort_by: contactsTableSortSchema.nullable().optional(),
    page_size: contactsTablePageSizeSchema.optional(),
  })
  .strict();

export const contactsPreferencesPatchSchema = z
  .object({
    contacts_table: contactsTablePreferencesSchema.optional(),
  })
  .strict();

export type ContactsTablePageSize = z.infer<typeof contactsTablePageSizeSchema>;
export type ContactsTableSort = z.infer<typeof contactsTableSortSchema>;
export type ContactsTablePreferences = z.infer<
  typeof contactsTablePreferencesSchema
>;
export type ContactsPreferencesPatch = z.infer<
  typeof contactsPreferencesPatchSchema
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readContactsTablePreferences(
  preferences: Record<string, unknown>,
): ContactsTablePreferences {
  const raw = preferences.contacts_table;
  if (!isRecord(raw)) return {};

  const parsed = contactsTablePreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
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
