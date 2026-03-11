import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, bio, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .single();

  return data;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, bio, avatar_url, created_at, updated_at")
    .eq("id", id)
    .single();

  return data;
}
