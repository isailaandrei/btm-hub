import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailAsset } from "@/types/database";

export async function createEmailAssetRecord(input: {
  storagePath: string;
  publicUrl: string;
  originalFilename: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif";
  sizeBytes: number;
  width: number | null;
  height: number | null;
}): Promise<EmailAsset> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_assets")
    .insert({
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create email asset: ${error.message}`);
  return data as EmailAsset;
}

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
