import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalAdminAiEnabled } from "./visibility";

describe("isLocalAdminAiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled by default", () => {
    expect(isLocalAdminAiEnabled()).toBe(false);
  });

  it("is enabled outside production when the local flag is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_ADMIN_AI", "1");
    expect(isLocalAdminAiEnabled()).toBe(true);
  });
});
