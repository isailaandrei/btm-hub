"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { logout } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type NavbarUser = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "member";
} | null;

interface AuthButtonsProps {
  variant?: "light" | "dark";
}

const CACHE_KEY = "btm-navbar-user";

export function AuthButtons({ variant = "dark" }: AuthButtonsProps) {

  const [user, setUser] = useState<NavbarUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Read cache synchronously before any async work
    let cached: NavbarUser = null;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch {}

    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe sessionStorage cache read; cannot use lazy initializer (SSR)
      setUser(cached);
      setLoading(false);
    }

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

    async function checkAuth() {
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
      if (!cached) {
        await fetchProfile(session.user.id);
      } else {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    }

    checkAuth();

    function handleProfileUpdate() {
      sessionStorage.removeItem(CACHE_KEY);
      checkAuth();
    }
    window.addEventListener("profile-updated", handleProfileUpdate);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        sessionStorage.removeItem(CACHE_KEY);
      } else if (event === "SIGNED_IN") {
        sessionStorage.removeItem(CACHE_KEY);
        checkAuth();
      }
    });

    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdate);
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <Skeleton className="h-8 w-32 rounded-full" />;
  }
  const isLight = variant === "light";

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className={`text-sm font-medium transition-opacity hover:opacity-75 ${
            isLight ? "text-foreground" : "text-white"
          }`}
        >
          Log In
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Join
        </Link>
      </div>
    );
  }

  const initials = (user.displayName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3">
      {user.role === "admin" && (
        <Link
          href="/admin"
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-normal text-white transition-opacity hover:opacity-90"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border transition-colors hover:border-primary"
      >
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.displayName || "Profile"}
            width={32}
            height={32}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-accent text-xs font-medium text-primary">
            {initials}
          </span>
        )}
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className={`text-sm font-medium transition-opacity hover:opacity-75 ${
            isLight ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Log Out
        </button>
      </form>
    </div>
  );
}
