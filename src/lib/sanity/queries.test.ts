import { describe, expect, it } from "vitest";
import { FILM_BY_SLUG_QUERY } from "./queries";

describe("film detail query", () => {
  it("projects credits with resolved team members and external links", () => {
    expect(FILM_BY_SLUG_QUERY).toContain("credits[]{");
    expect(FILM_BY_SLUG_QUERY).toContain(
      '"teamMember": teamMember->{ _id, name, slug }',
    );
    expect(FILM_BY_SLUG_QUERY).toContain("externalLinks[]{ label, url }");
    expect(FILM_BY_SLUG_QUERY).not.toContain("gallery");
    expect(FILM_BY_SLUG_QUERY).not.toContain("heroImage");
    expect(FILM_BY_SLUG_QUERY).not.toContain("thumbnailImage");
  });
});
