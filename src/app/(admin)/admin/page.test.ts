import { describe, expect, it } from "vitest";

const { default: AdminPage } = await import("./page");

describe("AdminPage", () => {
  it("leaves dashboard rendering to the persistent admin layout frame", () => {
    expect(AdminPage()).toBeNull();
  });
});

