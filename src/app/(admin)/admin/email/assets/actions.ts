"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createEmailAsset,
  EMAIL_ASSET_BUCKET,
} from "@/lib/data/email-assets";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailAsset } from "@/types/database";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const EMAIL_ASSET_CACHE_CONTROL_SECONDS = "31536000";

function extensionForMimeType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  return "webp";
}

export async function uploadEmailAssetAction(
  formData: FormData,
): Promise<EmailAsset> {
  const profile = await requireAdmin();
  const file = formData.get("image");
  if (!(file instanceof File)) throw new Error("No image selected");
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Email images must be JPEG, PNG, GIF, or WebP.");
  }
  if (file.size <= 0 || file.size > MAX_SIZE_BYTES) {
    throw new Error("Email images must be between 1 byte and 5 MB.");
  }

  const supabase = await createAdminClient();
  const storagePath = `${profile.id}/${crypto.randomUUID()}.${extensionForMimeType(
    file.type,
  )}`;
  const { error: uploadError } = await supabase.storage
    .from(EMAIL_ASSET_BUCKET)
    .upload(storagePath, file, {
      cacheControl: EMAIL_ASSET_CACHE_CONTROL_SECONDS,
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload email image: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(EMAIL_ASSET_BUCKET)
    .getPublicUrl(storagePath);

  const asset = await createEmailAsset({
    storagePath,
    publicUrl: data.publicUrl,
    originalFilename: file.name,
    mimeType: file.type as EmailAsset["mime_type"],
    sizeBytes: file.size,
  });

  return asset;
}
