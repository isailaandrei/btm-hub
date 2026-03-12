"use client";

import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import type { NavbarUser } from "@/lib/data/auth";

interface AuthButtonsProps {
  user: NavbarUser;
  variant?: "light" | "dark";
}

export function AuthButtons({ user, variant = "dark" }: AuthButtonsProps) {
  const isLight = variant === "light";

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className={`text-sm font-medium transition-opacity hover:opacity-75 ${
            isLight ? "text-brand-text" : "text-white"
          }`}
        >
          Log In
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
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
      <Link
        href="/profile"
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-brand-secondary transition-colors hover:border-brand-primary"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName || "Profile"}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-brand-dark-navy text-xs font-medium text-brand-primary">
            {initials}
          </span>
        )}
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className={`text-sm font-medium transition-opacity hover:opacity-75 ${
            isLight ? "text-brand-text" : "text-brand-cyan-blue-gray"
          }`}
        >
          Log Out
        </button>
      </form>
    </div>
  );
}
