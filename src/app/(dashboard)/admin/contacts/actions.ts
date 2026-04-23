"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  updateContact,
  assignTag,
  unassignTag,
  bulkAssignTags,
  bulkUnassignTags,
  deleteApplication as deleteApplicationData,
} from "@/lib/data/contacts";
import { updateProfilePreferences } from "@/lib/data/profiles";
import {
  syncContactMemory,
  syncContactMemoryBulk,
} from "@/lib/admin-ai-memory/server-action-sync";

const contactEmailSchema = z.email("Please enter a valid email address");

export async function editContact(
  contactId: string,
  fields: { name?: string; email?: string; phone?: string | null },
  options?: { expectedUpdatedAt?: string },
) {
  validateUUID(contactId);
  if (fields.name !== undefined) {
    fields.name = fields.name.trim();
    if (!fields.name) throw new Error("Name is required");
  }
  if (fields.email !== undefined) {
    fields.email = fields.email.trim().toLowerCase();
    if (!fields.email) throw new Error("Email is required");
    const parsed = contactEmailSchema.safeParse(fields.email);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid email address");
    }
  }
  await updateContact(contactId, fields, options);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
  await syncContactMemory(contactId);
}

export async function assignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await assignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
  await syncContactMemory(contactId);
}

export async function unassignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await unassignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
  await syncContactMemory(contactId);
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
  const result = await bulkAssignTags(contactIds, tagId);
  revalidatePath("/admin");
  await syncContactMemoryBulk(contactIds);
  return result;
}

export async function bulkUnassignTag(contactIds: string[], tagId: string) {
  if (contactIds.length === 0) return;
  if (contactIds.length > MAX_BULK_ASSIGN) {
    throw new Error(`Cannot unassign from more than ${MAX_BULK_ASSIGN} contacts at once`);
  }
  for (const id of contactIds) validateUUID(id, "contact");
  validateUUID(tagId, "tag");
  await bulkUnassignTags(contactIds, tagId);
  revalidatePath("/admin");
  await syncContactMemoryBulk(contactIds);
}

export async function deleteApplication(applicationId: string) {
  validateUUID(applicationId, "application");
  const deletedApplication = await deleteApplicationData(applicationId);
  if (deletedApplication.contact_id) {
    revalidatePath(`/admin/contacts/${deletedApplication.contact_id}`);
    await syncContactMemory(deletedApplication.contact_id);
  }
  revalidatePath("/admin");
}
