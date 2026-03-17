import { describe, it, expect } from "vitest";
import { getApplicantName, escapeSearchTerm } from "./applications";

// ---------------------------------------------------------------------------
// getApplicantName
// ---------------------------------------------------------------------------

describe("getApplicantName", () => {
  it("returns full name from first and last", () => {
    expect(
      getApplicantName({ first_name: "Alice", last_name: "Smith" }),
    ).toBe("Alice Smith");
  });

  it("returns first name only when last is missing", () => {
    expect(getApplicantName({ first_name: "Alice" })).toBe("Alice");
  });

  it("returns last name only when first is missing", () => {
    expect(getApplicantName({ last_name: "Smith" })).toBe("Smith");
  });

  it("returns fallback when both names are missing", () => {
    expect(getApplicantName({})).toBe("—");
  });

  it("uses custom fallback", () => {
    expect(getApplicantName({}, "Unknown")).toBe("Unknown");
  });

  it("ignores empty string names", () => {
    expect(getApplicantName({ first_name: "", last_name: "" })).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// escapeSearchTerm
// ---------------------------------------------------------------------------

describe("escapeSearchTerm", () => {
  it("escapes percent sign", () => {
    expect(escapeSearchTerm("100%")).toBe("100\\%");
  });

  it("escapes underscore", () => {
    expect(escapeSearchTerm("hello_world")).toBe("hello\\_world");
  });

  it("escapes backslash", () => {
    expect(escapeSearchTerm("a\\b")).toBe("a\\\\b");
  });

  it("removes dots", () => {
    expect(escapeSearchTerm("Dr. Smith")).toBe("Dr Smith");
  });

  it("removes parentheses", () => {
    expect(escapeSearchTerm("John (Jr)")).toBe("John Jr");
  });

  it("removes commas", () => {
    expect(escapeSearchTerm("Smith, John")).toBe("Smith John");
  });

  it("handles multiple special characters", () => {
    expect(escapeSearchTerm("100% (test)._x")).toBe("100\\% test\\_x");
  });

  it("passes through normal text unchanged", () => {
    expect(escapeSearchTerm("Alice Smith")).toBe("Alice Smith");
  });
});
