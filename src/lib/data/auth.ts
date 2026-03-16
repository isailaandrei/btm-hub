import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

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
  role: string;
} | null;

export const getNavbarUser = cache(async (): Promise<NavbarUser> => {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role")
    .eq("id", authUser.id)
    .single();

  return {
    id: authUser.id,
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    role: profile?.role ?? "member",
  };
});
