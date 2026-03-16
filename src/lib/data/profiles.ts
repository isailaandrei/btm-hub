import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import type { Profile } from "@/types/database";

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, role, display_name, bio, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .single();

  return data;
});

export const getAllProfiles = cache(async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, display_name, bio, avatar_url, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch profiles: ${error.message}`);

  return data ?? [];
});

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, role, display_name, bio, avatar_url, created_at, updated_at")
    .eq("id", id)
    .single();

  return data;
}
