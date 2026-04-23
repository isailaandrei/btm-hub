import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isValidISODate } from "@/lib/validation-helpers";
import { VersionConflictError } from "@/lib/optimistic-concurrency";
import type {
  Contact,
  TagCategory,
  Tag,
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
  options?: { expectedUpdatedAt?: string },
) {
  await requireAdmin();
  if (options?.expectedUpdatedAt && !isValidISODate(options.expectedUpdatedAt)) {
    throw new Error("Invalid contact version");
  }

  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (options?.expectedUpdatedAt) {
    query = query.eq("updated_at", options.expectedUpdatedAt);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Failed to update contact: ${error.message}`);
  if (!data) {
    if (options?.expectedUpdatedAt) {
      throw new VersionConflictError("contact");
    }
    throw new Error("Contact not found");
  }
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
  options?: { expectedUpdatedAt?: string },
) {
  await requireAdmin();
  if (options?.expectedUpdatedAt && !isValidISODate(options.expectedUpdatedAt)) {
    throw new Error("Invalid tag category version");
  }

  const supabase = await createClient();
  let query = supabase
    .from("tag_categories")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (options?.expectedUpdatedAt) {
    query = query.eq("updated_at", options.expectedUpdatedAt);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Failed to update category: ${error.message}`);
  if (!data) {
    if (options?.expectedUpdatedAt) {
      throw new VersionConflictError("tag category");
    }
    throw new Error("Tag category not found");
  }
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

export async function updateTag(
  id: string,
  name: string,
  options?: { expectedUpdatedAt?: string },
) {
  await requireAdmin();
  if (options?.expectedUpdatedAt && !isValidISODate(options.expectedUpdatedAt)) {
    throw new Error("Invalid tag version");
  }

  const supabase = await createClient();
  let query = supabase
    .from("tags")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (options?.expectedUpdatedAt) {
    query = query.eq("updated_at", options.expectedUpdatedAt);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Failed to update tag: ${error.message}`);
  if (!data) {
    if (options?.expectedUpdatedAt) {
      throw new VersionConflictError("tag");
    }
    throw new Error("Tag not found");
  }
}

export interface BulkAssignTagsResult {
  requested: number;
  existing: number;
  inserted: number;
  alreadyAssigned: number;
  skippedMissing: number;
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

export async function bulkAssignTags(
  contactIds: string[],
  tagId: string,
): Promise<BulkAssignTagsResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_assign_contact_tags", {
    p_contact_ids: contactIds,
    p_tag_id: tagId,
  });

  if (error) throw new Error(`Failed to bulk assign tags: ${error.message}`);
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(result.requested ?? contactIds.length),
    existing: Number(result.existing ?? 0),
    inserted: Number(result.inserted ?? 0),
    alreadyAssigned: Number(result.already_assigned ?? 0),
    skippedMissing: Number(result.skipped_missing ?? 0),
  };
}

export async function deleteApplication(applicationId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .select("id, contact_id")
    .maybeSingle();
  if (error) throw new Error(`Failed to delete application: ${error.message}`);
  if (!data) throw new Error("Application not found");
  return data as { id: string; contact_id: string | null };
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
