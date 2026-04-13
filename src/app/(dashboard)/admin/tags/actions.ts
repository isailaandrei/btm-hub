"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { isValidISODate, validateUUID } from "@/lib/validation-helpers";
import {
  createTagCategory,
  updateTagCategory,
  deleteTagCategory,
  createTag,
  updateTag,
  deleteTag,
} from "@/lib/data/contacts";
import { TAG_COLOR_VALUES } from "../constants";

const tagCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name must be 100 characters or fewer"),
  color: z.enum(TAG_COLOR_VALUES).nullable(),
});

const tagSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  name: z
    .string()
    .trim()
    .min(1, "Tag name is required")
    .max(100, "Tag name must be 100 characters or fewer"),
});

export type TagFormState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
  resetKey: number;
};

function normalizeTagColor(color: string | null): string | null {
  if (color == null) return null;
  if (!TAG_COLOR_VALUES.includes(color)) {
    throw new Error("Invalid tag color");
  }
  return color;
}

function mapTagMutationError(error: unknown, duplicateMessage: string): string {
  if (
    error instanceof Error &&
    /duplicate|already exists|unique/i.test(error.message)
  ) {
    return duplicateMessage;
  }
  return error instanceof Error
    ? error.message
    : "The tag update failed. Please try again.";
}

export async function addCategory(name: string, color: string | null) {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Category name is required");
  await createTagCategory(trimmed, normalizeTagColor(color));
  revalidatePath("/admin");
}

export async function submitCategoryForm(
  prevState: TagFormState,
  formData: FormData,
): Promise<TagFormState> {
  const rawColor = String(formData.get("color") ?? "");
  const parsed = tagCategorySchema.safeParse({
    name: formData.get("name") ?? "",
    color: rawColor === "" ? null : rawColor,
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
    await addCategory(parsed.data.name, parsed.data.color);
    return {
      errors: null,
      message: `Category "${parsed.data.name}" created.`,
      success: true,
      resetKey: prevState.resetKey + 1,
    };
  } catch (error) {
    return {
      errors: null,
      message: mapTagMutationError(
        error,
        "A category with that name already exists.",
      ),
      success: false,
      resetKey: prevState.resetKey,
    };
  }
}

export async function editCategory(
  id: string,
  fields: { name?: string; color?: string | null },
  options?: { expectedUpdatedAt?: string },
) {
  validateUUID(id);
  if (options?.expectedUpdatedAt && !isValidISODate(options.expectedUpdatedAt)) {
    throw new Error("Invalid tag category version");
  }
  if (fields.name !== undefined) {
    fields.name = fields.name.trim().slice(0, 100);
    if (!fields.name) throw new Error("Category name is required");
  }
  if (fields.color !== undefined) {
    fields.color = normalizeTagColor(fields.color);
  }
  await updateTagCategory(id, fields, options);
  revalidatePath("/admin");
}

export async function removeCategory(id: string) {
  validateUUID(id);
  await deleteTagCategory(id);
  revalidatePath("/admin");
}

export async function addTagToCategory(categoryId: string, name: string) {
  validateUUID(categoryId);
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");
  await createTag(categoryId, trimmed);
  revalidatePath("/admin");
}

export async function submitTagForm(
  prevState: TagFormState,
  formData: FormData,
): Promise<TagFormState> {
  const parsed = tagSchema.safeParse({
    categoryId: formData.get("categoryId") ?? "",
    name: formData.get("name") ?? "",
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
    validateUUID(parsed.data.categoryId);
  } catch {
    return {
      errors: { categoryId: ["Invalid category."] },
      message: null,
      success: false,
      resetKey: prevState.resetKey,
    };
  }

  try {
    await addTagToCategory(parsed.data.categoryId, parsed.data.name);
    return {
      errors: null,
      message: `Tag "${parsed.data.name}" added.`,
      success: true,
      resetKey: prevState.resetKey + 1,
    };
  } catch (error) {
    return {
      errors: null,
      message: mapTagMutationError(
        error,
        "A tag with that name already exists in this category.",
      ),
      success: false,
      resetKey: prevState.resetKey,
    };
  }
}

export async function editTag(
  tagId: string,
  name: string,
  options?: { expectedUpdatedAt?: string },
) {
  validateUUID(tagId);
  if (options?.expectedUpdatedAt && !isValidISODate(options.expectedUpdatedAt)) {
    throw new Error("Invalid tag version");
  }
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");
  await updateTag(tagId, trimmed, options);
  revalidatePath("/admin");
}

export async function removeTag(tagId: string) {
  validateUUID(tagId);
  await deleteTag(tagId);
  revalidatePath("/admin");
}
