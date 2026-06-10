import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260610000001_contact_activity_summary.sql";

describe("contact activity summary SQL", () => {
  it("creates a security-invoker aggregate read model with event and application fallback fields", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE OR REPLACE VIEW contact_activity_summary");
    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("DISTINCT ON (contact_id)");
    expect(migration).toContain("bool_or(type = 'info_requested'");
    expect(migration).toContain("bool_or(type = 'awaiting_btm_response'");
    expect(migration).toContain("max(submitted_at)");
  });
});
