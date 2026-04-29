import { describe, expect, it } from "vitest";
import type { EmailAsset } from "@/types/database";
import {
  DEFAULT_DESIGNER_MJML,
  buildAssetImageBlockMjml,
  buildBrandFooterMjml,
  buildBrandHeaderMjml,
  buildHeroMjml,
  getAssetIdsForMjml,
  normalizeGrapesMjml,
} from "./designer-helpers";

const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  storage_path: "email-assets/ocean.jpg",
  public_url: "https://cdn.example.com/email-assets/ocean.jpg",
  original_filename: "ocean.jpg",
  mime_type: "image/jpeg",
  size_bytes: 1000,
  width: 1200,
  height: 800,
  created_by: "admin",
  created_at: "2026-04-29T00:00:00.000Z",
} satisfies EmailAsset;

describe("email designer helpers", () => {
  it("provides a branded starter template with header, footer, and personalization", () => {
    expect(DEFAULT_DESIGNER_MJML).toContain("<mjml>");
    expect(DEFAULT_DESIGNER_MJML).toContain("Behind The Mask");
    expect(DEFAULT_DESIGNER_MJML).toContain("{{ contact.name }}");
    expect(DEFAULT_DESIGNER_MJML).toContain("You are receiving this email");
  });

  it("builds reusable branded blocks for the visual designer", () => {
    expect(buildBrandHeaderMjml()).toContain("Behind The Mask");
    expect(buildBrandFooterMjml()).toContain("You are receiving this email");
    expect(buildHeroMjml()).toMatch(/^<mj-hero/);
    expect(buildAssetImageBlockMjml(asset)).toContain(asset.public_url);
    expect(buildAssetImageBlockMjml(asset)).toContain(asset.original_filename);
  });

  it("normalizes GrapesJS output to a root MJML document", () => {
    expect(
      normalizeGrapesMjml("<body><mjml><mj-body></mj-body></mjml></body>"),
    ).toBe("<mjml><mj-body></mj-body></mjml>");
    expect(normalizeGrapesMjml("<mj-section></mj-section>")).toBe(
      "<mjml><mj-body><mj-section></mj-section></mj-body></mjml>",
    );
  });

  it("extracts asset ids referenced by the MJML", () => {
    expect(
      getAssetIdsForMjml(
        `<mjml><mj-body>${buildAssetImageBlockMjml(asset)}</mj-body></mjml>`,
        [asset],
      ),
    ).toEqual([asset.id]);
  });
});
