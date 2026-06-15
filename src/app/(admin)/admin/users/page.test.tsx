/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/types/database";

const mockGetAllProfiles = vi.fn();

vi.mock("@/lib/data/profiles", () => ({
  getAllProfiles: mockGetAllProfiles,
}));

const { default: UsersPage } = await import("./page");

const profiles: Profile[] = [
  {
    id: "profile-1",
    email: "admin@example.invalid",
    display_name: "Admin User",
    bio: null,
    avatar_url: null,
    role: "admin",
    preferences: {},
    created_at: "2026-06-01T12:00:00Z",
    updated_at: "2026-06-02T12:00:00Z",
  },
  {
    id: "profile-2",
    email: "member@example.invalid",
    display_name: null,
    bio: null,
    avatar_url: null,
    role: "member",
    preferences: {},
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-02T12:00:00Z",
  },
];

describe("UsersPage", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the profile list instead of redirecting back to the dashboard", async () => {
    mockGetAllProfiles.mockResolvedValue(profiles);

    const page = await UsersPage();

    act(() => {
      root.render(page);
    });

    expect(container.textContent).toContain("Users");
    expect(container.textContent).toContain("Admin User");
    expect(container.textContent).toContain("admin@example.invalid");
    expect(container.textContent).toContain("member@example.invalid");
    expect(container.textContent).toContain("2");
    expect(mockGetAllProfiles).toHaveBeenCalledOnce();
  });
});
