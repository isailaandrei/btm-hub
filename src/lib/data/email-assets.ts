import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailAsset } from "@/types/database";

export const EMAIL_ASSET_BUCKET = "email-assets";

export const listEmailAssets = cache(
  async function listEmailAssets(): Promise<EmailAsset[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load email assets: ${error.message}`);
    return (data ?? []) as EmailAsset[];
  },
);

export async function createEmailAsset(input: {
  storagePath: string;
  publicUrl: string;
  originalFilename: string;
  mimeType: EmailAsset["mime_type"];
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}): Promise<EmailAsset> {
  const profile = await requireAdmin();
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_assets")
    .insert({
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create email asset: ${error.message}`);
  return data as EmailAsset;
}
