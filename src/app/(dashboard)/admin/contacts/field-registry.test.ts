import { describe, it, expect } from "vitest";
import { normalizeAgeToRange, normalizeBtmCategory, getFieldEntry } from "./field-registry";

describe("normalizeAgeToRange", () => {
  describe("canonical range passthrough", () => {
    it("returns canonical ranges unchanged", () => {
      expect(normalizeAgeToRange("18-24")).toBe("18-24");
      expect(normalizeAgeToRange("25-34")).toBe("25-34");
      expect(normalizeAgeToRange("35-44")).toBe("35-44");
      expect(normalizeAgeToRange("45-54")).toBe("45-54");
      expect(normalizeAgeToRange("55+")).toBe("55+");
    });

    it("trims surrounding whitespace before matching canonical ranges", () => {
      expect(normalizeAgeToRange("  18-24 ")).toBe("18-24");
      expect(normalizeAgeToRange("\t55+\n")).toBe("55+");
    });
  });

  describe("numeric bucketing", () => {
    it("maps boundary values at the lower edge of each bucket", () => {
      expect(normalizeAgeToRange("18")).toBe("18-24");
      expect(normalizeAgeToRange("25")).toBe("25-34");
      expect(normalizeAgeToRange("35")).toBe("35-44");
      expect(normalizeAgeToRange("45")).toBe("45-54");
      expect(normalizeAgeToRange("55")).toBe("55+");
    });

    it("maps boundary values at the upper edge of each bucket", () => {
      expect(normalizeAgeToRange("24")).toBe("18-24");
      expect(normalizeAgeToRange("34")).toBe("25-34");
      expect(normalizeAgeToRange("44")).toBe("35-44");
      expect(normalizeAgeToRange("54")).toBe("45-54");
    });

    it("maps interior values correctly", () => {
      expect(normalizeAgeToRange("21")).toBe("18-24");
      expect(normalizeAgeToRange("30")).toBe("25-34");
      expect(normalizeAgeToRange("40")).toBe("35-44");
      expect(normalizeAgeToRange("50")).toBe("45-54");
      expect(normalizeAgeToRange("70")).toBe("55+");
      expect(normalizeAgeToRange("99")).toBe("55+");
    });
  });

  describe("text variants", () => {
    it("strips ' years old' and ' year old' suffix", () => {
      expect(normalizeAgeToRange("24 years old")).toBe("18-24");
      expect(normalizeAgeToRange("30 year old")).toBe("25-34");
    });

    it("is case-insensitive on the 'years old' suffix", () => {
      expect(normalizeAgeToRange("24 YEARS OLD")).toBe("18-24");
      expect(normalizeAgeToRange("30 Year Old")).toBe("25-34");
    });
  });

  describe("unmappable inputs return null", () => {
    it("returns null for empty / whitespace-only", () => {
      expect(normalizeAgeToRange("")).toBeNull();
      expect(normalizeAgeToRange("   ")).toBeNull();
      expect(normalizeAgeToRange("\t\n")).toBeNull();
    });

    it("returns null for non-numeric garbage", () => {
      expect(normalizeAgeToRange("abc")).toBeNull();
      expect(normalizeAgeToRange("twenty-one")).toBeNull();
      expect(normalizeAgeToRange("N/A")).toBeNull();
    });

    it("returns null for ages below the curated range", () => {
      expect(normalizeAgeToRange("17")).toBeNull();
      expect(normalizeAgeToRange("15")).toBeNull();
      expect(normalizeAgeToRange("1")).toBeNull();
    });

    it("returns null for 0 and negative numbers", () => {
      expect(normalizeAgeToRange("0")).toBeNull();
      expect(normalizeAgeToRange("-5")).toBeNull();
    });

    it("returns null for non-string inputs", () => {
      expect(normalizeAgeToRange(21)).toBeNull();
      expect(normalizeAgeToRange(null)).toBeNull();
      expect(normalizeAgeToRange(undefined)).toBeNull();
      expect(normalizeAgeToRange({})).toBeNull();
      expect(normalizeAgeToRange([])).toBeNull();
    });
  });
});

describe("FIELD_REGISTRY age entry", () => {
  it("has canonical normalization attached", () => {
    const age = getFieldEntry("age");
    expect(age).toBeDefined();
    expect(age?.canonical).toBeDefined();
    expect(age?.canonical?.normalize).toBe(normalizeAgeToRange);
  });

  it("includes internship in its programs list", () => {
    const age = getFieldEntry("age");
    expect(age?.programs).toContain("internship");
  });
});

describe("FIELD_REGISTRY health_conditions entry", () => {
  it("includes freediving in its programs list", () => {
    const hc = getFieldEntry("health_conditions");
    expect(hc?.programs).toContain("freediving");
  });

  it("includes both diving and freediving health-condition phrasings", () => {
    const hc = getFieldEntry("health_conditions");
    expect(hc?.options).toContain("No health conditions affecting diving");
    expect(hc?.options).toContain("No health conditions affecting freediving");
  });
});

describe("normalizeBtmCategory", () => {
  it("strips parenthetical from filmmaking/photography categories", () => {
    expect(normalizeBtmCategory("ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)")).toBe("ASPIRING PROFESSIONAL");
    expect(normalizeBtmCategory("BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)")).toBe("BEGINNER - Creative Explorer");
    expect(normalizeBtmCategory("DEDICATED ACHIEVER (Business-focused, seeking intensive mentorship)")).toBe("DEDICATED ACHIEVER");
  });

  it("strips parenthetical from freediving categories", () => {
    expect(normalizeBtmCategory("ASPIRING PROFESSIONAL (Actor/model aiming to expand skill-set)")).toBe("ASPIRING PROFESSIONAL");
    expect(normalizeBtmCategory("INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)")).toBe("INDEPENDENT CREATOR");
  });

  it("both freediving and non-freediving ASPIRING PROFESSIONAL normalize to the same value", () => {
    const filmmaking = normalizeBtmCategory("ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)");
    const freediving = normalizeBtmCategory("ASPIRING PROFESSIONAL (Actor/model aiming to expand skill-set)");
    expect(filmmaking).toBe(freediving);
    expect(filmmaking).toBe("ASPIRING PROFESSIONAL");
  });

  it("returns null for empty/invalid input", () => {
    expect(normalizeBtmCategory("")).toBeNull();
    expect(normalizeBtmCategory(null)).toBeNull();
    expect(normalizeBtmCategory("Unknown category")).toBeNull();
  });
});

describe("FIELD_REGISTRY btm_category entry", () => {
  it("has canonical normalization attached", () => {
    const btm = getFieldEntry("btm_category");
    expect(btm?.canonical).toBeDefined();
    expect(btm?.canonical?.normalize).toBe(normalizeBtmCategory);
  });

  it("canonical options are the short labels without parentheticals", () => {
    const btm = getFieldEntry("btm_category");
    expect(btm?.canonical?.options).toContain("ASPIRING PROFESSIONAL");
    expect(btm?.canonical?.options).not.toContain(
      "ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)",
    );
  });
});
