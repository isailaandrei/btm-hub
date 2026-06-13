import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GLOBAL_CSS_PATH = "src/app/globals.css";
const EMAIL_STUDIO_PATH = "src/app/(dashboard)/admin/email/email-studio.tsx";
const MAILY_CSS_IMPORT = "@maily-to/core/style.css";

describe("Maily CSS scoping", () => {
  it("keeps Maily package CSS out of root global CSS", () => {
    const globalCss = readFileSync(GLOBAL_CSS_PATH, "utf8");
    expect(globalCss).not.toContain(MAILY_CSS_IMPORT);
  });

  it("loads Maily package CSS with the lazy Email studio", () => {
    const emailStudio = readFileSync(EMAIL_STUDIO_PATH, "utf8");
    expect(emailStudio).toContain(MAILY_CSS_IMPORT);
  });
});
