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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateId(id: string) {
  if (!UUID_RE.test(id)) throw new Error("Invalid application ID");
}

export async function changeStatus(applicationId: string, status: ApplicationStatus) {
  validateId(applicationId);
  await requireAdmin();
  await updateApplicationStatus(applicationId, status);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin");
}

export async function addTag(applicationId: string, tag: string) {
  validateId(applicationId);
  await requireAdmin();
  const trimmed = tag.trim().slice(0, 50);
  if (!trimmed) return;
  await addApplicationTag(applicationId, trimmed);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin");
}

export async function removeTag(applicationId: string, tag: string) {
  validateId(applicationId);
  await requireAdmin();
  await removeApplicationTag(applicationId, tag);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin");
}

export async function addNote(applicationId: string, text: string) {
  validateId(applicationId);
  const profile = await requireAdmin();
  const trimmed = text.trim();
  if (!trimmed) return;
  await addAdminNote(applicationId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath(`/admin/applications/${applicationId}`);
}
