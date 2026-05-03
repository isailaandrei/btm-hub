"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  archiveEmailTemplate,
  createEmailTemplate,
  createEmailTemplateVersion,
  getEmailTemplateVersion,
} from "@/lib/data/email-templates";
import {
  assertMailyDocument,
  getAssetIdsForMailyDocument,
  renderMailyDocument,
} from "@/lib/email/rendering/maily";
import { validateUUID } from "@/lib/validation-helpers";
import type { EmailTemplate } from "@/types/database";

export type EmailTemplateFormState = {
  errors: Record<string, string[]>;
  message: string;
  template: EmailTemplate | null;
  success: boolean;
};

const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Template name is required")
    .max(120, "Template name must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer"),
  category: z
    .string()
    .trim()
    .min(1, "Category is required")
    .max(80, "Category must be 80 characters or fewer"),
});

const publishTemplateVersionSchema = z.object({
  templateId: z.string().min(1, "Template is required"),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(200, "Subject must be 200 characters or fewer"),
  previewText: z
    .string()
    .trim()
    .max(200, "Preview text must be 200 characters or fewer"),
  builderJson: z.unknown(),
});

export async function createTemplateAction(
  _previousState: EmailTemplateFormState,
  formData: FormData,
): Promise<EmailTemplateFormState> {
  await requireAdmin();
  const parsed = templateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "",
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: "",
      template: null,
      success: false,
    };
  }

  const template = await createEmailTemplate({
    ...parsed.data,
    description: parsed.data.description || undefined,
  });
  revalidatePath("/admin");
  return {
    errors: {},
    message: "Template created.",
    template,
    success: true,
  };
}

export async function publishTemplateVersionAction(input: {
  templateId: string;
  subject: string;
  previewText: string;
  builderJson: unknown;
}): Promise<{ ok: true; versionId: string }> {
  await requireAdmin();
  const parsed = publishTemplateVersionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid email template version",
    );
  }

  validateUUID(parsed.data.templateId, "template");
  const document = assertMailyDocument(parsed.data.builderJson);
  const assetIds = getAssetIdsForMailyDocument(document);
  for (const assetId of assetIds) validateUUID(assetId, "asset");

  const rendered = await renderMailyDocument(document, {
    previewText: parsed.data.previewText,
  });
  const version = await createEmailTemplateVersion({
    templateId: parsed.data.templateId,
    subject: parsed.data.subject,
    previewText: parsed.data.previewText,
    builderJson: document as Record<string, unknown>,
    html: rendered.html,
    text: rendered.text,
    assetIds,
  });

  revalidatePath("/admin");
  return { ok: true, versionId: version.id };
}

export async function getTemplateVersionForEditorAction(
  templateVersionId: string,
): Promise<{
  subject: string;
  previewText: string;
  builderJson: Record<string, unknown>;
} | null> {
  await requireAdmin();
  validateUUID(templateVersionId, "template version");

  const version = await getEmailTemplateVersion(templateVersionId);
  if (!version) return null;

  return {
    subject: version.subject,
    previewText: version.preview_text,
    builderJson: version.builder_json,
  };
}

export async function deleteTemplateAction(
  templateId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(templateId, "template");

  await archiveEmailTemplate(templateId);
  revalidatePath("/admin");
  return { ok: true };
}
