"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  updateContact,
  assignTag,
  unassignTag,
  addContactNote,
  bulkAssignTags,
  bulkUnassignTags,
  deleteApplication as deleteApplicationData,
} from "@/lib/data/contacts";
import { updateProfilePreferences } from "@/lib/data/profiles";

export async function editContact(
  contactId: string,
  fields: { name?: string; email?: string; phone?: string | null },
) {
  validateUUID(contactId);
  await requireAdmin();
  if (fields.name !== undefined) {
    fields.name = fields.name.trim();
    if (!fields.name) throw new Error("Name is required");
  }
  if (fields.email !== undefined) {
    fields.email = fields.email.trim().toLowerCase();
    if (!fields.email) throw new Error("Email is required");
  }
  await updateContact(contactId, fields);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function assignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await requireAdmin();
  await assignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function unassignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await requireAdmin();
  await unassignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function addNote(contactId: string, text: string) {
  validateUUID(contactId);
  const profile = await requireAdmin();
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  await addContactNote(contactId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function updatePreferences(patch: Record<string, unknown>) {
  const profile = await requireAdmin();
  return updateProfilePreferences(profile.id, patch);
}

const MAX_BULK_ASSIGN = 500;

export async function bulkAssignTag(contactIds: string[], tagId: string) {
  if (contactIds.length === 0) return;
  if (contactIds.length > MAX_BULK_ASSIGN) {
    throw new Error(`Cannot assign to more than ${MAX_BULK_ASSIGN} contacts at once`);
  }
  for (const id of contactIds) validateUUID(id, "contact");
  validateUUID(tagId, "tag");
  await requireAdmin();
  await bulkAssignTags(contactIds, tagId);
  revalidatePath("/admin");
}

export async function bulkUnassignTag(contactIds: string[], tagId: string) {
  if (contactIds.length === 0) return;
  if (contactIds.length > MAX_BULK_ASSIGN) {
    throw new Error(`Cannot unassign from more than ${MAX_BULK_ASSIGN} contacts at once`);
  }
  for (const id of contactIds) validateUUID(id, "contact");
  validateUUID(tagId, "tag");
  await requireAdmin();
  await bulkUnassignTags(contactIds, tagId);
  revalidatePath("/admin");
}

export async function deleteApplication(applicationId: string) {
  validateUUID(applicationId, "application");
  await requireAdmin();
  await deleteApplicationData(applicationId);
  revalidatePath("/admin");
}
