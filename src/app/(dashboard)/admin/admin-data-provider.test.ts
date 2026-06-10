import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ADMIN_DATA_PROVIDER_PATH =
  "src/app/(dashboard)/admin/admin-data-provider.tsx";

describe("AdminDataProvider preferences", () => {
  it("does not fetch admin preferences through the browser Supabase client", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).not.toContain("ensurePreferences");
    expect(source).not.toContain("supabase.auth.getUser()");
    expect(source).not.toContain('.select("preferences")');
  });
});

describe("AdminDataProvider application projection", () => {
  it("uses projected contact-list application rows instead of full admin application rows", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).toContain("buildApplicationProjectionSelect");
    expect(source).toContain("reassembleProjectedApplications");
    expect(source).not.toContain("admin_notes");
    expect(source).not.toContain("tags, admin_notes");
  });
});
