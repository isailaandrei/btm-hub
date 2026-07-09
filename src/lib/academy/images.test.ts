import { describe, expect, it } from "vitest";
import {
  panelImage,
  deepDiveImage,
  detailHeroImage,
  detailOverviewImage,
} from "./images";

// Minimal Sanity image sources — the resolvers only ever return them verbatim,
// so distinct refs let us assert exactly which slot won.
const hero = {
  _type: "image" as const,
  asset: { _ref: "image-hero-800x600-jpg", _type: "reference" as const },
};
const panel = {
  _type: "image" as const,
  asset: { _ref: "image-panel-800x600-jpg", _type: "reference" as const },
};
const overview = {
  _type: "image" as const,
  asset: { _ref: "image-overview-800x600-jpg", _type: "reference" as const },
};

describe("panelImage", () => {
  it("returns the CMS panel image when set", () => {
    expect(panelImage({ panelImage: panel })).toBe(panel);
  });

  it("does not fall through to hero/overview", () => {
    expect(panelImage({ heroImage: hero, overviewImage: overview })).toBeNull();
  });

  it("is null for null/undefined cms", () => {
    expect(panelImage(null)).toBeNull();
    expect(panelImage(undefined)).toBeNull();
  });
});

describe("deepDiveImage", () => {
  it("prefers the overview image", () => {
    expect(deepDiveImage({ overviewImage: overview, heroImage: hero })).toBe(
      overview,
    );
  });

  it("falls back to the legacy hero image when overview is absent", () => {
    expect(deepDiveImage({ heroImage: hero })).toBe(hero);
  });

  it("is null when neither overview nor hero is set", () => {
    expect(deepDiveImage({ panelImage: panel })).toBeNull();
    expect(deepDiveImage(null)).toBeNull();
    expect(deepDiveImage(undefined)).toBeNull();
  });
});

describe("detailHeroImage", () => {
  it("returns the hero image when set", () => {
    expect(detailHeroImage({ heroImage: hero })).toBe(hero);
  });

  it("does not fall through to overview/panel", () => {
    expect(
      detailHeroImage({ overviewImage: overview, panelImage: panel }),
    ).toBeNull();
  });

  it("is null for null/undefined cms", () => {
    expect(detailHeroImage(null)).toBeNull();
    expect(detailHeroImage(undefined)).toBeNull();
  });
});

describe("detailOverviewImage", () => {
  it("returns the overview image when set", () => {
    expect(detailOverviewImage({ overviewImage: overview })).toBe(overview);
  });

  it("deliberately does NOT fall back to the hero image", () => {
    expect(detailOverviewImage({ heroImage: hero })).toBeNull();
  });

  it("is null for null/undefined cms", () => {
    expect(detailOverviewImage(null)).toBeNull();
    expect(detailOverviewImage(undefined)).toBeNull();
  });
});
