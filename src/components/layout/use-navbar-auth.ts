"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NavbarUser } from "@/lib/data/auth";

/**
 * Client-side navbar auth state, shared by every navbar presentation
 * (marketing {@link AuthButtons} and the homepage nav cluster).
 *
 * Behaviour, preserved verbatim from the original AuthButtons effect:
 * - When `initialUser` is provided (server-rendered), trust it and skip the
 *   client `getSession()` round-trip — only subscribe for live changes.
 * - Otherwise read a `sessionStorage` cache first (no skeleton flash), then
 *   confirm against Supabase and refresh the profile in the background.
 * - Stay in sync with `SIGNED_IN` / `SIGNED_OUT` and the app's
 *   `profile-updated` event.
 */

const CACHE_KEY = "btm-navbar-user";

export function useNavbarAuth(initialUser?: NavbarUser): {
  user: NavbarUser;
  loading: boolean;
} {
  const hasInitialUser = initialUser !== undefined;
  const [user, setUser] = useState<NavbarUser>(initialUser ?? null);
  const [loading, setLoading] = useState(!hasInitialUser);

  useEffect(() => {
    const supabase = createClient();

    async function fetchProfile(userId: string) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, role")
        .eq("id", userId)
        .single();

      if (profile) {
        const navUser: NavbarUser = {
          id: userId,
          displayName: profile.display_name ?? null,
          avatarUrl: profile.avatar_url ?? null,
          role: profile.role,
        };
        setUser(navUser);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(navUser));
        } catch {}
      } else {
        setUser(null);
        sessionStorage.removeItem(CACHE_KEY);
      }
    }

    async function checkAuth({ readCache = true }: { readCache?: boolean } = {}) {
      // Apply sessionStorage cache immediately (before any await) to avoid skeleton flash
      let hadCache = false;
      if (readCache) {
        try {
          const raw = sessionStorage.getItem(CACHE_KEY);
          if (raw) {
            setUser(JSON.parse(raw) as NavbarUser);
            setLoading(false);
            hadCache = true;
          }
        } catch {}
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUser(null);
        setLoading(false);
        sessionStorage.removeItem(CACHE_KEY);
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

    if (hasInitialUser) {
      try {
        if (initialUser) {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(initialUser));
        } else {
          sessionStorage.removeItem(CACHE_KEY);
        }
      } catch {}
    } else {
      checkAuth();
    }

    function handleProfileUpdate() {
      sessionStorage.removeItem(CACHE_KEY);
      checkAuth({ readCache: false });
    }
    window.addEventListener("profile-updated", handleProfileUpdate);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
        sessionStorage.removeItem(CACHE_KEY);
      } else if (event === "SIGNED_IN") {
        sessionStorage.removeItem(CACHE_KEY);
        checkAuth({ readCache: false });
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
