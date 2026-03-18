import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { getProfile } from "@/lib/data/profiles";

/**
 * Cached auth user — deduplicates supabase.auth.getUser() across
 * all server components/functions within a single request.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type NavbarUser = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "member";
} | null;

export const getNavbarUser = cache(async (): Promise<NavbarUser> => {
  const profile = await getProfile();
  if (!profile) return null;

  return {
    id: profile.id,
    displayName: profile.display_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    role: profile.role,
  };
});
