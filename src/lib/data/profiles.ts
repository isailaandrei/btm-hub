import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { Profile } from "@/types/database";

// Columns for a full Profile row — shared by every profile fetcher below.
const PROFILE_COLUMNS =
  "id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(`Profile fetch failed: ${error.message}`);
  if (data) return data;

  // Authenticated user, but no profiles row. Returning null makes /profile
  // redirect to /login, which the proxy bounces right back to /profile (the
  // session is valid) — an infinite redirect loop. The handle_new_user trigger
  // covers new signups; this self-heals accounts created before that trigger or
  // out-of-band. RLS only allows self-inserting a 'member' profile.
  return await provisionMissingProfile(supabase, user);
});

/**
 * Create the missing profile row for an already-authenticated user, then return
 * it. Prevents the /login ↔ /profile redirect loop when a session exists without
 * a backing profile. Note: RLS restricts self-insert to role='member', so a
 * would-be admin recovered this way lands as a member (disclosed via console.warn)
 * and must be re-elevated deliberately.
 */
async function provisionMissingProfile(
  supabase: ServerClient,
  user: User,
): Promise<Profile> {
  if (!user.email) {
    throw new Error(
      `Cannot self-provision profile for ${user.id}: auth record has no email`,
    );
  }

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    user.email.split("@")[0];

  // Disclosed fallback — see CLAUDE.md "Fallbacks are acceptable only when disclosed".
  console.warn(
    `[getProfile] No profiles row for authenticated user ${user.id} (${user.email}). ` +
      `Self-provisioning a 'member' profile — account likely predates the ` +
      `handle_new_user trigger or was created out-of-band.`,
  );

  // Race-safe: ON CONFLICT DO NOTHING, then read the row back (ours, the
  // trigger's, or a concurrent request's) so we always return a real Profile.
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email, display_name: displayName, role: "member" },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (upsertError) {
    throw new Error(
      `Failed to self-provision profile for ${user.id}: ${upsertError.message}`,
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  if (error || !data) {
    throw new Error(
      `Self-provisioned profile for ${user.id} but could not read it back: ${
        error?.message ?? "no row returned"
      }`,
    );
  }

  return data;
}

export const getAllProfiles = cache(async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch profiles: ${error.message}`);

  return data ?? [];
});

export const getProfileById = cache(async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
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
