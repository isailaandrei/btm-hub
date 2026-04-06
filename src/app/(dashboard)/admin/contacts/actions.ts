"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  updateContact,
  assignTag,
  unassignTag,
  addContactNote,
} from "@/lib/data/contacts";

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
