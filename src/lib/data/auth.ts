import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type NavbarUser = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
} | null;

export const getNavbarUser = cache(async (): Promise<NavbarUser> => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", authUser.id)
    .single();

  return {
    id: authUser.id,
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
});
