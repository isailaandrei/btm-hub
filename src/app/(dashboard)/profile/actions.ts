"use server";

import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";

export type ProfileState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
};

export async function updateProfile(
  prevState: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { errors: null, message: "You must be logged in.", success: false };
  }

  const raw = {
    displayName: formData.get("displayName") as string,
    bio: formData.get("bio") as string,
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: null,
      success: false,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return {
      errors: null,
      message: "Failed to update profile. Please try again.",
      success: false,
    };
  }

  revalidatePath("/profile");
  return { errors: null, message: "Profile updated!", success: true };
}

export async function uploadAvatar(
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { url: null, error: "You must be logged in." };
  }

  const file = formData.get("avatar") as File;
  if (!file || file.size === 0) {
    return { url: null, error: "No file selected." };
  }

  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    return { url: null, error: "File must be under 2MB." };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { url: null, error: "File must be JPEG, PNG, or WebP." };
  }

  const ext = file.name.split(".").pop();
  const filePath = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    return { url: null, error: "Upload failed. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(filePath);

  const avatarUrl = `${publicUrl}?t=${Date.now()}`;
  await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/profile");
  return { url: avatarUrl, error: null };
}
