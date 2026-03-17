"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  updateApplicationStatus,
  addApplicationTag,
  removeApplicationTag,
  addAdminNote,
} from "@/lib/data/applications";
import type { ApplicationStatus } from "@/types/database";
import { validateUUID } from "@/lib/validation-helpers";

export async function changeStatus(applicationId: string, status: ApplicationStatus) {
  validateUUID(applicationId);
  await requireAdmin();
  await updateApplicationStatus(applicationId, status);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
}

export async function addTag(applicationId: string, tag: string) {
  validateUUID(applicationId);
  await requireAdmin();
  const trimmed = tag.trim().slice(0, 50);
  if (!trimmed) return;
  await addApplicationTag(applicationId, trimmed);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
}

export async function removeTag(applicationId: string, tag: string) {
  validateUUID(applicationId);
  await requireAdmin();
  await removeApplicationTag(applicationId, tag);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
}

export async function addNote(applicationId: string, text: string) {
  validateUUID(applicationId);
  const profile = await requireAdmin();
  const trimmed = text.trim();
  if (!trimmed) return;
  await addAdminNote(applicationId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath(`/admin/applications/${applicationId}`);
}
