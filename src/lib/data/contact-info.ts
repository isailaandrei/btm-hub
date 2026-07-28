import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { ContactInfoField } from "@/types/database";

// Person-level custom info on contacts (insurance number, address, rashguard
// size, …): fields are admin-defined once and reusable across all contacts.

export const getContactInfoFields = cache(async function getContactInfoFields() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_info_fields")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load contact info fields: ${error.message}`);
  }
  return data as ContactInfoField[];
});

export interface ContactInfoValueRow {
  field_id: string;
  value: string;
  updated_at: string;
  contact_info_fields: Pick<ContactInfoField, "id" | "name" | "sort_order">;
}

export const getContactInfoValues = cache(async function getContactInfoValues(
  contactId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_info_values")
    .select("field_id, value, updated_at, contact_info_fields(id, name, sort_order)")
    .eq("contact_id", contactId);

  if (error) {
    throw new Error(`Failed to load contact info values: ${error.message}`);
  }
  return data as unknown as ContactInfoValueRow[];
});

export async function setContactInfoValue(
  contactId: string,
  fieldId: string,
  value: string,
) {
  await requireAdmin();
  const supabase = await createClient();
  // updated_at must be set explicitly — PostgREST upsert does not bump column
  // defaults on the UPDATE path.
  const { error } = await supabase.from("contact_info_values").upsert(
    {
      contact_id: contactId,
      field_id: fieldId,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contact_id,field_id" },
  );

  if (error) {
    throw new Error(`Failed to save contact info value: ${error.message}`);
  }
}

export async function createContactInfoFieldWithValue(
  contactId: string,
  name: string,
  value: string,
): Promise<ContactInfoField> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_contact_info_field_value", {
    p_contact_id: contactId,
    p_field_name: name,
    p_value: value,
  });

  if (error) {
    throw new Error(`Failed to create contact info field: ${error.message}`);
  }
  return data as ContactInfoField;
}

export async function removeContactInfoValue(contactId: string, fieldId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_info_values")
    .delete()
    .eq("contact_id", contactId)
    .eq("field_id", fieldId);

  if (error) {
    throw new Error(`Failed to remove contact info value: ${error.message}`);
  }
}
