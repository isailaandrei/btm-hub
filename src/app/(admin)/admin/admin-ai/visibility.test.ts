import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminAiEnabled } from "./visibility";

describe("isAdminAiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled by default", () => {
    expect(isAdminAiEnabled()).toBe(false);
  });

  it("is enabled when the flag is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_ADMIN_AI", "1");
    expect(isAdminAiEnabled()).toBe(true);
  });

  it("stays enabled in production when the flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SHOW_ADMIN_AI", "1");
    expect(isAdminAiEnabled()).toBe(true);
  });

  it("treats any other flag value as disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_ADMIN_AI", "true");
    expect(isAdminAiEnabled()).toBe(false);
  });
});
