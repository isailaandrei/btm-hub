import { z } from "zod/v4";
import {
  CONTACTS_TABLE_PAGE_SIZES,
  mergeContactsTablePreferencePatch,
  readContactsTablePreferences,
  type ContactsPreferencesPatch,
  type ContactsTablePageSize,
  type ContactsTablePreferences,
  type ContactsTableSort,
} from "./preferences-shared";

export {
  CONTACTS_TABLE_PAGE_SIZES,
  mergeContactsTablePreferencePatch,
  readContactsTablePreferences,
  type ContactsPreferencesPatch,
  type ContactsTablePageSize,
  type ContactsTablePreferences,
  type ContactsTableSort,
};

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
