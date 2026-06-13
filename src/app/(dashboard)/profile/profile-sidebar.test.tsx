import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ProfileSidebar } from "./profile-sidebar";
import type { Profile } from "@/types/database";

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: {
    href: string;
    prefetch?: boolean;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
}));

vi.mock("./avatar-upload", () => ({
  AvatarUpload: () => <div data-testid="avatar-upload" />,
}));

describe("ProfileSidebar", () => {
  it("shows messages and notifications entry points with unread count", () => {
    const profile: Profile = {
      id: "profile-1",
      email: "member@example.com",
      display_name: "Member",
      bio: null,
      avatar_url: null,
      role: "member",
      preferences: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <ProfileSidebar profile={profile} unreadNotifications={3} />,
    );

    expect(html).toContain("Messages");
    expect(html).toContain("Notifications");
    expect(html).toContain(">3<");
  });

  it("disables automatic prefetch for profile section links", () => {
    const profile: Profile = {
      id: "profile-1",
      email: "member@example.com",
      display_name: "Member",
      bio: null,
      avatar_url: null,
      role: "member",
      preferences: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <ProfileSidebar profile={profile} unreadNotifications={3} />,
    );

    const prefetchAttributes = Array.from(
      html.matchAll(/data-prefetch="([^"]+)"/g),
      ([, value]) => value,
    );

    expect(prefetchAttributes).toEqual([
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
  });
});
