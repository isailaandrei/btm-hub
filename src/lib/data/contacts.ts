import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  Contact,
  TagCategory,
  Tag,
  ContactNote,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Contacts — Read
// ---------------------------------------------------------------------------

export const getContacts = cache(async function getContacts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load contacts: ${error.message}`);
  return data as Contact[];
});

export const getContactById = cache(async function getContactById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Contact;
});

// ---------------------------------------------------------------------------
// Contacts — Write
// ---------------------------------------------------------------------------

export async function updateContact(
  id: string,
  fields: { name?: string; email?: string; phone?: string | null },
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update contact: ${error.message}`);
}

/**
 * Find or create a contact by email. Used during application submission.
 * Does NOT require admin — delegates to a SECURITY DEFINER RPC so the contacts
 * table is never directly accessible from the public submission flow.
 */
export async function findOrCreateContact(
  email: string,
  name: string,
  phone: string | null,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_or_create_contact", {
    p_email: email,
    p_name: name,
    p_phone: phone,
  });

  if (error) throw new Error(`Failed to find or create contact: ${error.message}`);
  return data as string;
}

// ---------------------------------------------------------------------------
// Tag Categories — CRUD
// ---------------------------------------------------------------------------

export const getTagCategories = cache(async function getTagCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tag_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load tag categories: ${error.message}`);
  return data as TagCategory[];
});

export async function createTagCategory(name: string, color: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  // Atomic sort_order assignment to avoid TOCTOU race
  const { data, error } = await supabase.rpc("insert_tag_category", {
    p_name: name,
    p_color: color,
  });

  if (error) throw new Error(`Failed to create category: ${error.message}`);
  return data as TagCategory;
}

export async function updateTagCategory(
  id: string,
  fields: { name?: string; color?: string | null },
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tag_categories")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(`Failed to update category: ${error.message}`);
}

export async function deleteTagCategory(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tag_categories")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete category: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Tags — CRUD
// ---------------------------------------------------------------------------

export const getTags = cache(async function getTags() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return data as Tag[];
});

export async function createTag(categoryId: string, name: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Atomic sort_order assignment to avoid TOCTOU race
  const { data, error } = await supabase.rpc("insert_tag", {
    p_category_id: categoryId,
    p_name: name,
  });

  if (error) throw new Error(`Failed to create tag: ${error.message}`);
  return data as Tag;
}

export async function updateTag(id: string, name: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", id);

  if (error) throw new Error(`Failed to update tag: ${error.message}`);
}

export async function deleteTag(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete tag: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Contact Tags — assign / remove
// ---------------------------------------------------------------------------

export const getContactTags = cache(async function getContactTags(contactId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tags")
    .select("tag_id, assigned_at, tags(*, tag_categories(*))")
    .eq("contact_id", contactId);

  if (error) throw new Error(`Failed to load contact tags: ${error.message}`);
  return data;
});

export async function assignTag(contactId: string, tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" });

  if (error) throw new Error(`Failed to assign tag: ${error.message}`);
}

export async function unassignTag(contactId: string, tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("contact_id", contactId)
    .eq("tag_id", tagId);

  if (error) throw new Error(`Failed to remove tag: ${error.message}`);
}

export async function bulkAssignTags(contactIds: string[], tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const rows = contactIds.map((contactId) => ({ contact_id: contactId, tag_id: tagId }));
  const { error } = await supabase
    .from("contact_tags")
    .upsert(rows, { onConflict: "contact_id,tag_id" });

  if (error) throw new Error(`Failed to bulk assign tags: ${error.message}`);
}

export async function bulkUnassignTags(contactIds: string[], tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .in("contact_id", contactIds)
    .eq("tag_id", tagId);

  if (error) throw new Error(`Failed to bulk unassign tags: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Contact Notes
// ---------------------------------------------------------------------------

export const getContactNotes = cache(async function getContactNotes(contactId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_notes")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load contact notes: ${error.message}`);
  return data as ContactNote[];
});

export async function addContactNote(
  contactId: string,
  authorId: string,
  authorName: string,
  text: string,
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_notes")
    .insert({ contact_id: contactId, author_id: authorId, author_name: authorName, text });

  if (error) throw new Error(`Failed to add note: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Applications for a contact
// ---------------------------------------------------------------------------

export const getApplicationsByContactId = cache(
  async function getApplicationsByContactId(contactId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .eq("contact_id", contactId)
      .order("submitted_at", { ascending: false });

    if (error) throw new Error(`Failed to load applications: ${error.message}`);
    return data;
  },
);
