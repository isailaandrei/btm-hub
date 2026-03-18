import { describe, it, expect } from "vitest";
import { isUUID, validateUUID } from "./validation-helpers";

describe("isUUID", () => {
  it("accepts valid lowercase UUID", () => {
    expect(isUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts valid uppercase UUID", () => {
    expect(isUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("accepts valid mixed-case UUID", () => {
    expect(isUUID("550e8400-E29B-41d4-A716-446655440000")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isUUID("")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isUUID("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")).toBe(false);
  });

  it("rejects missing dashes", () => {
    expect(isUUID("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects wrong segment lengths", () => {
    expect(isUUID("550e840-0e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rejects UUID with extra characters", () => {
    expect(isUUID("550e8400-e29b-41d4-a716-4466554400001")).toBe(false);
  });
});

describe("validateUUID", () => {
  it("does not throw for valid UUID", () => {
    expect(() =>
      validateUUID("550e8400-e29b-41d4-a716-446655440000"),
    ).not.toThrow();
  });

  it("throws for invalid UUID", () => {
    expect(() => validateUUID("not-a-uuid")).toThrow("Invalid application ID");
  });
});
