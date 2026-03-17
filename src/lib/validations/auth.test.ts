import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema, profileSchema } from "./auth";

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------

describe("registerSchema", () => {
  const valid = {
    email: "new@example.com",
    password: "StrongPass1",
    confirmPassword: "StrongPass1",
    displayName: "Test User",
  };

  it("accepts valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "Ab1", confirmPassword: "Ab1" });
    expect(result.success).toBe(false);
  });

  it("rejects password without lowercase letter", () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: "ALLCAPS123",
      confirmPassword: "ALLCAPS123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase letter", () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: "alllower123",
      confirmPassword: "alllower123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without number", () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: "NoNumbersHere",
      confirmPassword: "NoNumbersHere",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      ...valid,
      confirmPassword: "Different1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects display name shorter than 2 characters", () => {
    const result = registerSchema.safeParse({ ...valid, displayName: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects display name longer than 50 characters", () => {
    const result = registerSchema.safeParse({
      ...valid,
      displayName: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// profileSchema
// ---------------------------------------------------------------------------

describe("profileSchema", () => {
  it("accepts valid profile", () => {
    expect(
      profileSchema.safeParse({ displayName: "Test", bio: "Hello" }).success,
    ).toBe(true);
  });

  it("accepts empty string bio", () => {
    expect(
      profileSchema.safeParse({ displayName: "Test", bio: "" }).success,
    ).toBe(true);
  });

  it("accepts missing bio (optional)", () => {
    expect(profileSchema.safeParse({ displayName: "Test" }).success).toBe(true);
  });

  it("rejects bio over 500 characters", () => {
    const result = profileSchema.safeParse({
      displayName: "Test",
      bio: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects short display name", () => {
    const result = profileSchema.safeParse({ displayName: "A" });
    expect(result.success).toBe(false);
  });
});
