"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NavbarUser } from "@/lib/data/auth";

/**
 * Client-side navbar auth state, shared by every navbar presentation
 * (marketing {@link AuthButtons} and the homepage nav cluster).
 *
 * Behaviour:
 * - When `initialUser` is provided (server-rendered), trust it and skip the
 *   client `getSession()` round-trip — only subscribe for live changes.
 * - Otherwise apply the localStorage cache first (no skeleton flash), then
 *   confirm against Supabase and refresh the profile in the background.
 *   localStorage — not sessionStorage — so the cache survives new tabs: the
 *   statically-served homepage has no server auth state, and without a cache
 *   every new tab waited a full hydrate + session + profile round-trip before
 *   the Admin button could appear. A stale cache can briefly show a logged-in
 *   header after the session ended elsewhere; the confirm pass corrects and
 *   clears it.
 * - Stay in sync with `SIGNED_IN` / `SIGNED_OUT` and the app's
 *   `profile-updated` event.
 */

const CACHE_KEY = "btm-navbar-user";

// Storage access is wrapped: localStorage can throw when the browser blocks
// site data, and a cache miss must never break auth resolution. Explicitly
// `window.localStorage` — the bare global resolves to Node's experimental
// (undefined) localStorage in tests. Only called from effect scope.
function readCachedUser(): NavbarUser | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as NavbarUser) : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedUser(user: NavbarUser) {
  try {
    if (user) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(CACHE_KEY);
    }
  } catch {}
}

export function useNavbarAuth(initialUser?: NavbarUser): {
  user: NavbarUser;
  loading: boolean;
} {
  const hasInitialUser = initialUser !== undefined;
  const [user, setUser] = useState<NavbarUser>(initialUser ?? null);
  const [loading, setLoading] = useState(!hasInitialUser);

  useEffect(() => {
    const supabase = createClient();

    // supabase-js emits SIGNED_IN while the mount check is still running on
    // initial page load, which used to fetch the same profile row twice in
    // parallel — collapse concurrent checks into one.
    let inFlightCheck: Promise<void> | null = null;

    async function fetchProfile(userId: string) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, role")
        .eq("id", userId)
        .single();

      // A transient query failure is NOT "signed out": keep whatever state we
      // have (server-seeded user or cached), disclose, and let the next auth
      // event retry — flipping the navbar to logged-out on a network blip
      // would fake a state we know is wrong (the session was just validated).
      // PGRST116 (no row) is a genuinely missing profile and falls through.
      if (error && error.code !== "PGRST116") {
        console.warn("[navbar-auth] profile fetch failed; keeping current state", {
          code: error.code,
          message: error.message,
        });
        return;
      }

      if (profile) {
        const navUser: NavbarUser = {
          id: userId,
          displayName: profile.display_name ?? null,
          avatarUrl: profile.avatar_url ?? null,
          role: profile.role,
        };
        setUser(navUser);
        writeCachedUser(navUser);
      } else {
        setUser(null);
        writeCachedUser(null);
      }
    }

    async function checkAuth({ readCache = true }: { readCache?: boolean } = {}) {
      // Apply the cached user immediately (before any await) to avoid a
      // skeleton flash while the session/profile round-trips run.
      let hadCache = false;
      if (readCache) {
        const cached = readCachedUser();
        if (cached !== undefined) {
          setUser(cached);
          setLoading(false);
          hadCache = true;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUser(null);
        setLoading(false);
        writeCachedUser(null);
        return;
      }

      // If we had cached data, we already rendered it — fetch profile in background to refresh
      if (hadCache) {
        fetchProfile(session.user.id);
      } else {
        await fetchProfile(session.user.id);
        setLoading(false);
      }
    }

    function requestCheckAuth(opts?: { readCache?: boolean }) {
      if (!inFlightCheck) {
        inFlightCheck = checkAuth(opts).finally(() => {
          inFlightCheck = null;
        });
      }
      return inFlightCheck;
    }

    if (hasInitialUser) {
      writeCachedUser(initialUser ?? null);
    } else {
      requestCheckAuth();
    }

    function handleProfileUpdate() {
      writeCachedUser(null);
      requestCheckAuth({ readCache: false });
    }
    window.addEventListener("profile-updated", handleProfileUpdate);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
        writeCachedUser(null);
      } else if (event === "SIGNED_IN") {
        writeCachedUser(null);
        requestCheckAuth({ readCache: false });
      }
    });

    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdate);
      subscription.unsubscribe();
    };
  }, [hasInitialUser, initialUser]);

  return { user, loading };
}

/** Two-letter avatar fallback from a display name (e.g. "Jane Doe" → "JD"). */
export function getInitials(displayName: string | null): string {
  return (displayName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
