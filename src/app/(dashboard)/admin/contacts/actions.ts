"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
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

const contactEmailSchema = z.email("Please enter a valid email address");
const contactNoteSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Note text is required")
    .max(2000, "Note must be 2000 characters or fewer"),
});

export type ContactNoteFormState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
  resetKey: number;
};

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

export async function addNote(contactId: string, text: string) {
  validateUUID(contactId);
  const profile = await requireAdmin();
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  await addContactNote(contactId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function submitContactNote(
  prevState: ContactNoteFormState,
  formData: FormData,
): Promise<ContactNoteFormState> {
  const contactId = String(formData.get("contactId") ?? "");
  try {
    validateUUID(contactId, "contact");
  } catch {
    return {
      errors: null,
      message: "Invalid contact.",
      success: false,
      resetKey: prevState.resetKey,
    };
  }

  const parsed = contactNoteSchema.safeParse({
    text: formData.get("text") ?? "",
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: null,
      success: false,
      resetKey: prevState.resetKey,
    };
  }

  try {
    await addNote(contactId, parsed.data.text);
    return {
      errors: null,
      message: "Note added.",
      success: true,
      resetKey: prevState.resetKey + 1,
    };
  } catch (error) {
    return {
      errors: null,
      message:
        error instanceof Error
          ? error.message
          : "Failed to add note. Please try again.",
      success: false,
      resetKey: prevState.resetKey,
    };
  }
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
