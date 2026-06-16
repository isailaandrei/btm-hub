"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listEmailAssetIdsByPublicUrls } from "@/lib/data/email-assets";
import {
  archiveEmailTemplate,
  createEmailTemplate,
  createEmailTemplateVersion,
  getEmailTemplateVersion,
} from "@/lib/data/email-templates";
import {
  assertMailyDocument,
  getAssetIdsForMailyDocument,
  getAssetPublicUrlsForMailyDocument,
  renderMailyDocument,
} from "@/lib/email/rendering/maily";
import { validateUUID } from "@/lib/validation-helpers";
import type { EmailTemplate } from "@/types/database";

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
});

const publishTemplateVersionSchema = z.object({
  templateId: z.string().min(1, "Template is required"),
  builderJson: z.unknown(),
});

export async function publishTemplateVersionAction(input: {
  templateId: string;
  builderJson: unknown;
}): Promise<{ ok: true; versionId: string }> {
  await requireAdmin();
  const parsed = publishTemplateVersionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid email template version",
    );
  }

  const version = await createVisualTemplateVersion(
    parsed.data.templateId,
    parsed.data.builderJson,
  );

  revalidatePath("/admin");
  return { ok: true, versionId: version.id };
}

export async function createAndPublishTemplateAction(input: {
  name: string;
  description?: string;
  builderJson: unknown;
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
  const version = await createVisualTemplateVersion(
    template.id,
    parsed.data.builderJson,
  );
  const publishedTemplate: EmailTemplate = {
    ...template,
    status: "published",
    current_version_id: version.id,
    updated_at: new Date().toISOString(),
  };

  revalidatePath("/admin");
  return { ok: true, template: publishedTemplate, versionId: version.id };
}

export async function getTemplateVersionForEditorAction(
  templateVersionId: string,
): Promise<{
  builderJson: Record<string, unknown>;
} | null> {
  await requireAdmin();
  validateUUID(templateVersionId, "template version");

  const version = await getEmailTemplateVersion(templateVersionId);
  if (!version) return null;

  return {
    builderJson: version.builder_json,
  };
}

// Sample values so variable placeholders (e.g. {{ contact.name }}) render as
// realistic text in the preview instead of falling back to their default.
const PREVIEW_SAMPLE_VARIABLES = {
  contact: { name: "Alex Rivera", email: "alex@example.com" },
  owner: { name: "Behind The Mask", email: "hello@behind-the-mask.com" },
};

export async function renderTemplatePreviewAction(input: {
  builderJson: unknown;
  previewText?: string;
}): Promise<{ html: string }> {
  await requireAdmin();
  const document = assertMailyDocument(input.builderJson);
  const rendered = await renderMailyDocument(document, {
    previewText: input.previewText?.trim() || undefined,
    variables: PREVIEW_SAMPLE_VARIABLES,
  });
  return { html: rendered.html };
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

async function createVisualTemplateVersion(
  templateId: string,
  builderJson: unknown,
) {
  validateUUID(templateId, "template");
  const document = assertMailyDocument(builderJson);
  const explicitAssetIds = getAssetIdsForMailyDocument(document);
  const uploadedAssetIds = await listEmailAssetIdsByPublicUrls(
    getAssetPublicUrlsForMailyDocument(document),
  );
  const assetIds = [...new Set([...explicitAssetIds, ...uploadedAssetIds])];
  for (const assetId of assetIds) validateUUID(assetId, "asset");

  const rendered = await renderMailyDocument(document);

  return createEmailTemplateVersion({
    templateId,
    builderJson: document as Record<string, unknown>,
    html: rendered.html,
    text: rendered.text,
    assetIds,
  });
}
