import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldShowMockShopProduct } from "./mock-product";

describe("mock shop product guard", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT;
    delete process.env.VERCEL_ENV;
    vi.unstubAllEnvs();
  });

  it("does not expose mock catalog data in production", () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    process.env.VERCEL_ENV = "production";

    expect(shouldShowMockShopProduct()).toBe(false);
  });

  it("does not expose mock catalog data in non-Vercel production runtimes", () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    delete process.env.VERCEL_ENV;
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldShowMockShopProduct()).toBe(false);
  });

  it("allows mock catalog data in preview runtimes", () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    process.env.VERCEL_ENV = "preview";
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldShowMockShopProduct()).toBe(true);
  });
});
