import { describe, expect, it } from "vitest";
import { slugify, slugifyUnique } from "./slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips diacritics", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  it("replaces non-alphanum characters with hyphens", () => {
    expect(slugify("What's the best gear?")).toBe("what-s-the-best-gear");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("foo---bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  it("truncates to 80 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(80);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("slugifyUnique", () => {
  it("appends a 6-char suffix", () => {
    const result = slugifyUnique("Hello World");
    expect(result).toMatch(/^hello-world-[a-z0-9]{6}$/);
  });

  it("keeps total length within 86 chars", () => {
    const long = "a".repeat(100);
    const result = slugifyUnique(long);
    expect(result.length).toBeLessThanOrEqual(86);
  });

  it("generates different slugs on repeated calls", () => {
    const a = slugifyUnique("Same Title");
    const b = slugifyUnique("Same Title");
    expect(a).not.toBe(b);
  });
});
