import { describe, expect, it } from "vitest";
import { resolveFilmCredit } from "./credits";

describe("resolveFilmCredit", () => {
  it("links team member credits to their public team page", () => {
    expect(
      resolveFilmCredit({
        role: "Director",
        name: "External Override",
        teamMember: {
          name: "Alex Rivera",
          slug: { current: "alex-rivera" },
        },
        externalLinks: [{ label: "Website", url: "https://example.com" }],
      }),
    ).toEqual({
      name: "Alex Rivera",
      role: "Director",
      href: "/team/alex-rivera",
      externalLinks: [{ label: "Website", url: "https://example.com" }],
      invalidLinkCount: 0,
    });
  });

  it("links external credits to their first safe external contact and keeps all safe links visible", () => {
    expect(
      resolveFilmCredit({
        role: "Composer",
        name: "Sam Lee",
        externalLinks: [
          { label: "Email", url: "mailto:sam@example.com" },
          { label: "Phone", url: "tel:+15551234567" },
          { label: "Broken", url: "javascript:alert(1)" },
        ],
      }),
    ).toEqual({
      name: "Sam Lee",
      role: "Composer",
      href: "mailto:sam@example.com",
      externalLinks: [
        { label: "Email", url: "mailto:sam@example.com" },
        { label: "Phone", url: "tel:+15551234567" },
      ],
      invalidLinkCount: 1,
    });
  });
});
