"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/types/database";
import { AvatarUpload } from "./avatar-upload";

interface SidebarLink {
  href: string;
  label: string;
  icon: "user" | "file" | "shield";
}

const ICON_PATHS: Record<string, string> = {
  user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.5-1.632Z",
  file: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  shield:
    "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
};

function NavIcon({ icon }: { icon: string }) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[icon]} />
    </svg>
  );
}

export function ProfileSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  const memberSince = new Date(profile.created_at).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );

  const links: SidebarLink[] = [
    { href: "/profile", label: "Profile", icon: "user" },
    { href: "/profile/applications", label: "My Applications", icon: "file" },
  ];

  if (profile.role === "admin") {
    links.push({ href: "/admin/applications", label: "Admin Panel", icon: "shield" });
  }

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[280px] lg:self-start">
      <div className="rounded-xl border border-brand-secondary bg-brand-near-black p-6">
        {/* Avatar + Identity */}
        <div className="flex flex-col items-center text-center">
          <AvatarUpload
            currentAvatarUrl={profile.avatar_url}
            displayName={profile.display_name}
          />
          <h2 className="mt-4 text-lg font-medium text-white">
            {profile.display_name || "Ocean Explorer"}
          </h2>
          <p className="mt-1 text-sm text-brand-cyan-blue-gray">
            {profile.email}
          </p>
          <span className="mt-3 inline-flex rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1 text-xs font-medium capitalize text-brand-primary">
            {profile.role}
          </span>
        </div>

        <div className="my-6 border-t border-brand-secondary" />

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-brand-primary/10 font-medium text-brand-primary"
                    : "text-brand-cyan-blue-gray hover:bg-brand-secondary/50 hover:text-white"
                }`}
              >
                <NavIcon icon={link.icon} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="my-6 border-t border-brand-secondary" />

        <p className="text-center text-xs text-brand-light-gray">
          Member since {memberSince}
        </p>
      </div>
    </aside>
  );
}
