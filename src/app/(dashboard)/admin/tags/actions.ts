"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  createTagCategory,
  updateTagCategory,
  deleteTagCategory,
  createTag,
  updateTag,
  deleteTag,
} from "@/lib/data/contacts";

export async function addCategory(name: string, color: string | null) {
  await requireAdmin();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Category name is required");
  await createTagCategory(trimmed, color);
  revalidatePath("/admin");
}

export async function editCategory(id: string, fields: { name?: string; color?: string | null }) {
  validateUUID(id);
  await requireAdmin();
  if (fields.name !== undefined) {
    fields.name = fields.name.trim().slice(0, 100);
    if (!fields.name) throw new Error("Category name is required");
  }
  await updateTagCategory(id, fields);
  revalidatePath("/admin");
}

export async function removeCategory(id: string) {
  validateUUID(id);
  await requireAdmin();
  await deleteTagCategory(id);
  revalidatePath("/admin");
}

export async function addTagToCategory(categoryId: string, name: string) {
  validateUUID(categoryId);
  await requireAdmin();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");
  await createTag(categoryId, trimmed);
  revalidatePath("/admin");
}

export async function editTag(tagId: string, name: string) {
  validateUUID(tagId);
  await requireAdmin();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");
  await updateTag(tagId, trimmed);
  revalidatePath("/admin");
}

export async function removeTag(tagId: string) {
  validateUUID(tagId);
  await requireAdmin();
  await deleteTag(tagId);
  revalidatePath("/admin");
}
