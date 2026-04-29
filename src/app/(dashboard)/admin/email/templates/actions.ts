"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import {
  createEmailTemplate,
  createEmailTemplateVersion,
} from "@/lib/data/email-templates";
import { renderMjmlEmail } from "@/lib/email/rendering/mjml";
import { validateUUID } from "@/lib/validation-helpers";

export type EmailTemplateFormState = {
  errors: Record<string, string[]>;
  message: string;
  templateId: string | null;
  success: boolean;
  resetKey: number;
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
  builderJson: z.record(z.string(), z.unknown()),
  mjml: z.string().trim().min(1, "Template body is required"),
  assetIds: z.array(z.string()),
});

export async function createTemplateAction(
  _previousState: EmailTemplateFormState,
  formData: FormData,
): Promise<EmailTemplateFormState> {
  const parsed = templateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "",
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: "",
      templateId: null,
      success: false,
      resetKey: _previousState.resetKey,
    };
  }

  const template = await createEmailTemplate(parsed.data);
  revalidatePath("/admin");
  return {
    errors: {},
    message: "Template created.",
    templateId: template.id,
    success: true,
    resetKey: _previousState.resetKey + 1,
  };
}

export async function publishTemplateVersionAction(input: {
  templateId: string;
  subject: string;
  previewText: string;
  builderJson: Record<string, unknown>;
  mjml: string;
  assetIds: string[];
}): Promise<{ ok: true; versionId: string }> {
  const parsed = publishTemplateVersionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid email template version",
    );
  }

  validateUUID(parsed.data.templateId, "template");
  for (const assetId of parsed.data.assetIds) {
    validateUUID(assetId, "asset");
  }

  const rendered = await renderMjmlEmail({
    subject: parsed.data.subject,
    mjml: parsed.data.mjml,
    variables: {
      contact: {
        name: "Alex",
        email: "alex@example.com",
      },
    },
  });

  const version = await createEmailTemplateVersion({
    templateId: parsed.data.templateId,
    subject: rendered.subject,
    previewText: parsed.data.previewText,
    builderJson: parsed.data.builderJson,
    mjml: parsed.data.mjml,
    html: rendered.html,
    text: rendered.text,
    assetIds: parsed.data.assetIds,
  });

  revalidatePath("/admin");
  return { ok: true, versionId: version.id };
}
