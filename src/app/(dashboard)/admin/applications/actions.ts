"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/data/profiles";
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

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return profile;
}

export async function changeStatus(applicationId: string, status: ApplicationStatus) {
  validateId(applicationId);
  await requireAdmin();
  await updateApplicationStatus(applicationId, status);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
}

export async function addTag(applicationId: string, tag: string) {
  validateId(applicationId);
  await requireAdmin();
  const trimmed = tag.trim();
  if (!trimmed) return;
  await addApplicationTag(applicationId, trimmed);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
}

export async function removeTag(applicationId: string, tag: string) {
  validateId(applicationId);
  await requireAdmin();
  await removeApplicationTag(applicationId, tag);
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
}

export async function addNote(applicationId: string, text: string) {
  validateId(applicationId);
  const profile = await requireAdmin();
  const trimmed = text.trim();
  if (!trimmed) return;
  await addAdminNote(applicationId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath(`/admin/applications/${applicationId}`);
}
