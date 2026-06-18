import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailTemplate, EmailTemplateVersion } from "@/types/database";

export async function createEmailTemplate(input: {
  name: string;
  description?: string;
  category: string;
}): Promise<EmailTemplate> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      name: input.name,
      description: input.description ?? "",
      category: input.category,
      builder_type: "maily",
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
  builderJson: Record<string, unknown>;
  html: string;
  text: string;
  assetIds: string[];
  /** Stable hash of the document, used to deduplicate auto-saved templates. */
  contentHash?: string;
}): Promise<EmailTemplateVersion> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_email_template_version", {
    p_template_id: input.templateId,
    p_builder_json: input.builderJson,
    p_html: input.html,
    p_text: input.text,
    p_asset_ids: input.assetIds,
    p_user_id: profile.id,
  });

  if (error) {
    throw new Error(`Failed to create email template version: ${error.message}`);
  }
  const version = data as EmailTemplateVersion;

  // The RPC predates content_hash; set it in a follow-up update so we don't have
  // to churn the function signature. A failure here must be loud — a version
  // without its hash would silently never deduplicate.
  if (input.contentHash) {
    const { error: hashError } = await supabase
      .from("email_template_versions")
      .update({ content_hash: input.contentHash })
      .eq("id", version.id);
    if (hashError) {
      throw new Error(
        `Failed to record template content hash: ${hashError.message}`,
      );
    }
    version.content_hash = input.contentHash;
  }

  return version;
}

/**
 * Find an existing, non-archived template version whose content matches the
 * given hash, so a send can reuse it instead of creating a duplicate template.
 * Returns the most recent match, or null when none exists.
 */
export async function findTemplateVersionIdByContentHash(
  contentHash: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_template_versions")
    .select("id, created_at, email_templates!inner(status)")
    .eq("content_hash", contentHash)
    .neq("email_templates.status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to look up template by content hash: ${error.message}`,
    );
  }
  return (data?.id as string | undefined) ?? null;
}

export async function archiveEmailTemplate(templateId: string): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({
      status: "archived",
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);

  if (error) throw new Error(`Failed to delete email template: ${error.message}`);
}

export const listEmailTemplates = cache(
  async function listEmailTemplates(): Promise<EmailTemplate[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .neq("status", "archived")
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

    if (error) {
      throw new Error(`Failed to load email template version: ${error.message}`);
    }
    return data as EmailTemplateVersion | null;
  },
);
