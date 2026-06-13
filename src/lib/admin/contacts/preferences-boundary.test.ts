import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONTACTS_PANEL_STATE_PATH =
  "src/app/(dashboard)/admin/contacts/contacts-panel-state.ts";
const PREFERENCES_SHARED_PATH = "src/lib/admin/contacts/preferences-shared.ts";
const PREFERENCES_SCHEMA_IMPORT = 'from "@/lib/admin/contacts/preferences"';
const PREFERENCES_SHARED_IMPORT = "@/lib/admin/contacts/preferences-shared";

describe("contacts preference import boundaries", () => {
  it("keeps the contacts client state on the Zod-free preference reader", () => {
    const contactsPanelState = readFileSync(CONTACTS_PANEL_STATE_PATH, "utf8");
    expect(contactsPanelState).toContain(PREFERENCES_SHARED_IMPORT);
    expect(contactsPanelState).not.toContain(PREFERENCES_SCHEMA_IMPORT);
  });

  it("keeps the shared preference reader free of Zod", () => {
    const sharedPreferences = readFileSync(PREFERENCES_SHARED_PATH, "utf8");
    expect(sharedPreferences).not.toContain("zod");
  });
});
