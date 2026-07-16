import { describe, expect, it } from "vitest";
import {
  FILMS_QUERY,
  FILM_BY_SLUG_QUERY,
  PROGRAM_BY_SLUG_QUERY,
  ALL_PROGRAMS_CMS_QUERY,
  ACADEMY_PAGE_SETTINGS_QUERY,
} from "./queries";

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

describe("films listing query", () => {
  it("projects the hero backdrop image for the featured-film hero", () => {
    expect(FILMS_QUERY).toContain("backdrop");
  });
});

describe("program queries project the admin-editable images", () => {
  it("PROGRAM_BY_SLUG_QUERY selects hero, panel and overview images", () => {
    expect(PROGRAM_BY_SLUG_QUERY).toContain("heroImage");
    expect(PROGRAM_BY_SLUG_QUERY).toContain("panelImage");
    expect(PROGRAM_BY_SLUG_QUERY).toContain("overviewImage");
  });

  it("ALL_PROGRAMS_CMS_QUERY selects hero, panel and overview images", () => {
    expect(ALL_PROGRAMS_CMS_QUERY).toContain("heroImage");
    expect(ALL_PROGRAMS_CMS_QUERY).toContain("panelImage");
    expect(ALL_PROGRAMS_CMS_QUERY).toContain("overviewImage");
  });

  it("ALL_PROGRAMS_CMS_QUERY projects the CMS-owned display copy", () => {
    for (const field of ["name", "tag", "overline", "description", "highlights"]) {
      expect(ALL_PROGRAMS_CMS_QUERY).toContain(field);
    }
  });

  it("PROGRAM_BY_SLUG_QUERY projects the detail-page display copy", () => {
    for (const field of ["name", "overline", "shortDescription", "description"]) {
      expect(PROGRAM_BY_SLUG_QUERY).toContain(field);
    }
  });
});

describe("academy page settings query", () => {
  it("selects the CTA background image from the fixed singleton", () => {
    expect(ACADEMY_PAGE_SETTINGS_QUERY).toContain(
      '_type == "academyPageSettings"',
    );
    expect(ACADEMY_PAGE_SETTINGS_QUERY).toContain('_id == "academyPageSettings"');
    expect(ACADEMY_PAGE_SETTINGS_QUERY).toContain("ctaImage");
  });

  it("projects the CMS-owned hero + CTA copy", () => {
    for (const field of [
      "heroEyebrow",
      "heroHeading",
      "ctaHeading",
      "ctaBody",
      "ctaButtonLabel",
    ]) {
      expect(ACADEMY_PAGE_SETTINGS_QUERY).toContain(field);
    }
  });

  it("projects the detail-page apply-band copy + shared Apply label", () => {
    for (const field of [
      "detailApplyHeading",
      "detailApplyBody",
      "applyButtonLabel",
    ]) {
      expect(ACADEMY_PAGE_SETTINGS_QUERY).toContain(field);
    }
  });
});
