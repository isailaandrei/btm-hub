import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailTemplate, EmailTemplateVersion } from "@/types/database";

export async function createEmailTemplate(input: {
  name: string;
  description: string;
  category: string;
}): Promise<EmailTemplate> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      name: input.name,
      description: input.description,
      category: input.category,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create email template: ${error.message}`);
  return data as EmailTemplate;
}

export async function createEmailTemplateVersion(input: {
  templateId: string;
  subject: string;
  previewText: string;
  builderJson: Record<string, unknown>;
  mjml: string;
  html: string;
  text: string;
  assetIds: string[];
}): Promise<EmailTemplateVersion> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data: latestVersion, error: latestError } = await supabase
    .from("email_template_versions")
    .select("version_number")
    .eq("template_id", input.templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`Failed to load template version: ${latestError.message}`);
  }

  const currentVersionNumber =
    typeof latestVersion?.version_number === "number"
      ? latestVersion.version_number
      : 0;

  const { data, error } = await supabase
    .from("email_template_versions")
    .insert({
      template_id: input.templateId,
      version_number: currentVersionNumber + 1,
      subject: input.subject,
      preview_text: input.previewText,
      builder_json: input.builderJson,
      mjml: input.mjml,
      html: input.html,
      text: input.text,
      asset_ids: input.assetIds,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create email template version: ${error.message}`);

  const version = data as EmailTemplateVersion;
  const { error: updateError } = await supabase
    .from("email_templates")
    .update({
      current_version_id: version.id,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.templateId);

  if (updateError) {
    throw new Error(`Failed to update email template: ${updateError.message}`);
  }

  return version;
}

export const listEmailTemplates = cache(
  async function listEmailTemplates(): Promise<EmailTemplate[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to load email templates: ${error.message}`);
    return (data ?? []) as EmailTemplate[];
  },
);

export const getEmailTemplateVersion = cache(
  async function getEmailTemplateVersion(
    id: string,
  ): Promise<EmailTemplateVersion | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_template_versions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Failed to load email template version: ${error.message}`);
    return data as EmailTemplateVersion | null;
  },
);
