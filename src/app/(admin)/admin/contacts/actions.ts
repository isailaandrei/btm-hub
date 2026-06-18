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
  getContactById,
} from "@/lib/data/contacts";
import {
  excludeContactEmail,
  liftContactExclusion,
} from "@/lib/data/email-suppressions";
import { updateProfilePreferences } from "@/lib/data/profiles";
import {
  contactsPreferencesPatchSchema,
  mergeContactsTablePreferencePatch,
} from "@/lib/admin/contacts/preferences";

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
}

export async function assignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await assignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function unassignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await unassignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

// Resolve the contact's email server-side rather than trusting the client.
async function requireContactEmail(contactId: string): Promise<string> {
  validateUUID(contactId);
  const contact = await getContactById(contactId);
  if (!contact) throw new Error("Contact not found");
  return contact.email;
}

export async function excludeContactFromEmail(contactId: string) {
  const email = await requireContactEmail(contactId);
  await excludeContactEmail({ contactId, email });
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function allowContactEmail(contactId: string) {
  const email = await requireContactEmail(contactId);
  await liftContactExclusion({ contactId, email });
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function updatePreferences(patch: Record<string, unknown>) {
  const profile = await requireAdmin();
  const parsed = contactsPreferencesPatchSchema.safeParse(patch);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid preferences";
    throw new Error(`Invalid preferences: ${message}`);
  }

  const mergedPatch = mergeContactsTablePreferencePatch(
    profile.preferences,
    parsed.data,
  );
  return updateProfilePreferences(profile.id, mergedPatch);
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
}

export async function deleteApplication(applicationId: string) {
  validateUUID(applicationId, "application");
  const deletedApplication = await deleteApplicationData(applicationId);
  if (deletedApplication.contact_id) {
    revalidatePath(`/admin/contacts/${deletedApplication.contact_id}`);
  }
  revalidatePath("/admin");
}
