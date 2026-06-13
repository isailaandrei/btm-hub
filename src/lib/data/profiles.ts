import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { Profile } from "@/types/database";

const PROFILE_SELECT =
  "id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at";

const NO_ROWS_ERROR = "PGRST116";
const DUPLICATE_KEY_ERROR = "23505";

function fallbackDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string | null {
  const metadataName = user.user_metadata?.display_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }
  return user.email?.split("@")[0] ?? null;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const loadProfile = async () => supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  const readProfile = async (): Promise<Profile | null> => {
    const { data, error } = await loadProfile();
    if (error && error.code !== NO_ROWS_ERROR) {
      throw new Error(`Profile fetch failed: ${error.message}`);
    }
    return data;
  };

  const profile = await readProfile();
  if (profile) return profile;

  const { data: createdProfile, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? "",
      display_name: fallbackDisplayName(user),
    })
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (!createError) {
    if (!createdProfile) {
      throw new Error("Profile creation succeeded, but no profile row was returned");
    }
    return createdProfile;
  }

  if (createError.code === DUPLICATE_KEY_ERROR) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const rereadProfile = await readProfile();
      if (rereadProfile) {
        return rereadProfile;
      }
    }
    throw new Error("Profile creation raced, but the profile row was not readable after retry");
  }

  throw new Error(`Profile creation failed: ${createError.message}`);
});

export const getAllProfiles = cache(async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch profiles: ${error.message}`);

  return data ?? [];
});

export const getProfileById = cache(async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(`Profile fetch failed: ${error.message}`);
  return data;
});

export async function updateProfilePreferences(
  profileId: string,
  patch: Record<string, unknown>,
) {
  await requireAdmin();
  const supabase = await createClient();

  // Atomic merge via Postgres RPC — avoids read-modify-write race condition
  const { data, error } = await supabase.rpc("merge_preferences", {
    p_profile_id: profileId,
    p_patch: patch,
  });

  if (error) throw new Error(`Failed to update preferences: ${error.message}`);
  return data as Record<string, unknown>;
}
