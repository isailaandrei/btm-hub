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
