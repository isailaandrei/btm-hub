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

  const { data, error } = await supabase.rpc("create_email_template_version", {
    p_template_id: input.templateId,
    p_subject: input.subject,
    p_preview_text: input.previewText,
    p_builder_json: input.builderJson,
    p_mjml: input.mjml,
    p_html: input.html,
    p_text: input.text,
    p_asset_ids: input.assetIds,
    p_user_id: profile.id,
  });

  if (error) throw new Error(`Failed to create email template version: ${error.message}`);
  return data as EmailTemplateVersion;
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
