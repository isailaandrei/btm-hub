import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { Profile } from "@/types/database";

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(`Profile fetch failed: ${error.message}`);
  return data;
});

export const getAllProfiles = cache(async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch profiles: ${error.message}`);

  return data ?? [];
});

export const getProfileById = cache(async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at")
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
