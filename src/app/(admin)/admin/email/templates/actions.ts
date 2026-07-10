"use server";

import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  archiveEmailTemplate,
  createEmailTemplate,
  getEmailTemplateVersion,
  renameEmailTemplate,
} from "@/lib/data/email-templates";
import {
} from "@/lib/email/rendering/maily";
import { createTemplateVersionFromDocument } from "@/lib/email/template-authoring";
import { validateUUID } from "@/lib/validation-helpers";
import type { EmailTemplate } from "@/types/database";

// Subject + preview are saved with the template so reusing it restores them.
// Both optional (older saves / blank composers have none) and capped to match
// the send-time limits.
const templateContentFields = {
  subjectTemplate: z
    .string()
    .trim()
    .max(200, "Subject must be 200 characters or fewer")
    .optional()
    .default(""),
  previewText: z
    .string()
    .trim()
    .max(200, "Preview text must be 200 characters or fewer")
    .optional()
    .default(""),
};

const templateEditorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Template name is required")
    .max(120, "Template name must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .default(""),
  builderJson: z.unknown(),
  ...templateContentFields,
});

const publishTemplateVersionSchema = z.object({
  templateId: z.string().min(1, "Template is required"),
  builderJson: z.unknown(),
  ...templateContentFields,
});

export async function publishTemplateVersionAction(input: {
  templateId: string;
  builderJson: unknown;
  subjectTemplate?: string;
  previewText?: string;
}): Promise<{ ok: true; versionId: string }> {
  await requireAdmin();
  const parsed = publishTemplateVersionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid email template version",
    );
  }

  const version = await createVisualTemplateVersion(parsed.data.templateId, {
    builderJson: parsed.data.builderJson,
    subjectTemplate: parsed.data.subjectTemplate,
    previewText: parsed.data.previewText,
  });

  return { ok: true, versionId: version.id };
}

export async function createAndPublishTemplateAction(input: {
  name: string;
  description?: string;
  builderJson: unknown;
  subjectTemplate?: string;
  previewText?: string;
}): Promise<{ ok: true; template: EmailTemplate; versionId: string }> {
  await requireAdmin();
  const parsed = templateEditorSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid template");
  }

  const template = await createEmailTemplate({
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    category: "general",
  });
  const version = await createVisualTemplateVersion(template.id, {
    builderJson: parsed.data.builderJson,
    subjectTemplate: parsed.data.subjectTemplate,
    previewText: parsed.data.previewText,
  });
  const publishedTemplate: EmailTemplate = {
    ...template,
    status: "published",
    current_version_id: version.id,
    updated_at: new Date().toISOString(),
  };

  return { ok: true, template: publishedTemplate, versionId: version.id };
}

export async function getTemplateVersionForEditorAction(
  templateVersionId: string,
): Promise<{
  builderJson: Record<string, unknown>;
  subjectTemplate: string;
  previewText: string;
} | null> {
  await requireAdmin();
  validateUUID(templateVersionId, "template version");

  const version = await getEmailTemplateVersion(templateVersionId);
  if (!version) return null;

  return {
    builderJson: version.builder_json,
    subjectTemplate: version.subject_template ?? "",
    previewText: version.preview_text ?? "",
  };
}

const renameTemplateSchema = z.object({
  templateId: z.string().min(1, "Template is required"),
  name: z
    .string()
    .trim()
    .min(1, "Template name is required")
    .max(120, "Template name must be 120 characters or fewer"),
});

export async function renameTemplateAction(input: {
  templateId: string;
  name: string;
}): Promise<{ ok: true; name: string }> {
  await requireAdmin();
  const parsed = renameTemplateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid template name");
  }
  validateUUID(parsed.data.templateId, "template");

  await renameEmailTemplate({
    templateId: parsed.data.templateId,
    name: parsed.data.name,
  });
  return { ok: true, name: parsed.data.name };
}

export async function deleteTemplateAction(
  templateId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(templateId, "template");

  await archiveEmailTemplate(templateId);
  return { ok: true };
}

async function createVisualTemplateVersion(
  templateId: string,
  input: {
    builderJson: unknown;
    subjectTemplate?: string;
    previewText?: string;
  },
) {
  return createTemplateVersionFromDocument({
    templateId,
    builderJson: input.builderJson,
    subjectTemplate: input.subjectTemplate,
    previewText: input.previewText,
  });
}
