"use client";

import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { getInitials } from "@/components/layout/use-navbar-auth";
import { useHomeAuth } from "./home-auth-context";

/**
 * Auth-aware nav clusters for the homepage, styled in the cinematic
 * "Life is an Ocean" language: monochrome outline/solid pills, Zilla Slab
 * (`font-display`), white on `#020306`.
 *
 * - Logged out → ghost "Log In" + solid white "Join".
 * - Logged in  → "Admin" (admins only) + profile avatar + "Log Out".
 *
 * {@link HomeNavAuth} sizes itself in container-query width units (`cqw`) so it
 * scales flush with the fixed 1680px desktop canvas it lives in.
 * {@link HomeNavAuthMobile} uses normal rem sizing inside the mobile menu.
 */

// Matches the HomeDesktop canvas width; design px → container-query width units.
const W = 1680;
const q = (px: number) => `${((px / W) * 100).toFixed(4)}cqw`;

// ---- Desktop (canvas, cqw-scaled) -----------------------------------------

export function HomeNavAuth() {
  const { user, loading } = useHomeAuth();

  if (loading) {
    return (
      <div
        className="animate-pulse rounded-full bg-white/10"
        style={{ width: q(150), height: q(44) }}
      />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center" style={{ gap: q(22) }}>
        <Link
          href="/login"
          className="font-display text-white/85 transition-colors hover:text-white"
          style={{ fontSize: q(16) }}
        >
          Log In
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center rounded-full bg-white font-display text-[#020306] transition-colors hover:bg-white/90"
          style={{ height: q(44), paddingInline: q(28), fontSize: q(16) }}
        >
          Join
        </Link>
      </div>
    );
  }

  const initials = getInitials(user.displayName);

  return (
    <div className="flex items-center" style={{ gap: q(18) }}>
      {user.role === "admin" && (
        <Link
          href="/admin"
          className="inline-flex items-center rounded-full border border-white/80 font-display text-white transition-colors hover:bg-white/10"
          style={{ height: q(44), paddingInline: q(24), fontSize: q(16) }}
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        aria-label="Your profile"
        className="relative inline-flex items-center justify-center overflow-hidden rounded-full border border-white/40 transition-colors hover:border-white"
        style={{ width: q(44), height: q(44) }}
      >
        {user.avatarUrl ? (
          <Image src={user.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <span className="font-display text-white" style={{ fontSize: q(15) }}>
            {initials}
          </span>
        )}
      </Link>
      <form action={logout} className="flex items-center">
        <button
          type="submit"
          className="font-display text-white/70 transition-colors hover:text-white"
          style={{ fontSize: q(16) }}
        >
          Log Out
        </button>
      </form>
    </div>
  );
}

// ---- Mobile (menu, rem-sized) ---------------------------------------------

export function HomeNavAuthMobile({ onNavigate }: { onNavigate?: () => void }) {
  const { user, loading } = useHomeAuth();

  if (loading) {
    return <div className="mt-6 h-12 w-40 animate-pulse rounded-full bg-white/10" />;
  }

  if (!user) {
    return (
      <div className="mt-6 flex flex-col items-center gap-4">
        <Link
          href="/register"
          onClick={onNavigate}
          className="rounded-full bg-white px-10 py-3 font-display text-base text-[#020306] transition-colors hover:bg-white/90"
        >
          Join
        </Link>
        <Link
          href="/login"
          onClick={onNavigate}
          className="font-display text-base text-white/85 transition-colors hover:text-white"
        >
          Log In
        </Link>
      </div>
    );
  }

  const initials = getInitials(user.displayName);

  return (
    <div className="mt-6 flex flex-col items-center gap-5">
      {user.role === "admin" && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className="rounded-full border border-white px-10 py-3 font-display text-base text-white transition-colors hover:bg-white/10"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        onClick={onNavigate}
        className="flex items-center gap-3 font-display text-base text-white/85 transition-colors hover:text-white"
      >
        <span className="grid size-9 place-items-center overflow-hidden rounded-full border border-white/40 text-sm">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt=""
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        Profile
      </Link>
      <form action={logout}>
        <button
          type="submit"
          onClick={onNavigate}
          className="font-display text-base text-white/70 transition-colors hover:text-white"
        >
          Log Out
        </button>
      </form>
    </div>
  );
}
