"use client";

import Link from "next/link";
import Image from "next/image";
import { logout } from "@/app/(auth)/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavbarAuth, getInitials } from "./use-navbar-auth";
import type { NavbarUser } from "@/lib/data/auth";

interface AuthButtonsProps {
  variant?: "light" | "dark";
  initialUser?: NavbarUser;
}

export function AuthButtons({
  variant = "dark",
  initialUser,
}: AuthButtonsProps) {
  const { user, loading } = useNavbarAuth(initialUser);

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

  const initials = getInitials(user.displayName);

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
