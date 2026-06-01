import { describe, expect, it } from "vitest";
import { toStreamUser } from "./user";

describe("toStreamUser", () => {
  it("maps profile display name and avatar to Stream user fields", () => {
    expect(
      toStreamUser({
        id: "profile-1",
        display_name: " Maya Reef ",
        avatar_url: "https://example.com/maya.jpg",
      }),
    ).toEqual({
      id: "profile-1",
      name: "Maya Reef",
      image: "https://example.com/maya.jpg",
    });
  });

  it("falls back to a stable member name when profile fields are empty", () => {
    expect(
      toStreamUser({
        id: "profile-2",
        display_name: " ",
        avatar_url: null,
      }),
    ).toEqual({
      id: "profile-2",
      name: "Community Member",
    });
  });
});
