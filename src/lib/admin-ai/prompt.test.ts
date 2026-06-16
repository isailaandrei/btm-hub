import { describe, expect, it } from "vitest";
import { buildAdminAiSystemPrompt } from "./prompt";

describe("buildAdminAiSystemPrompt", () => {
  it("treats explicit user constraints as hard exclusions instead of shortlist guidance", () => {
    const prompt = buildAdminAiSystemPrompt("global", {
      includeEvidence: false,
    });

    expect(prompt).toContain("Hard constraints are exclusionary");
    expect(prompt).toContain("Do not include candidates who fail");
    expect(prompt).toContain("Return fewer results, or an empty shortlist");
    expect(prompt).not.toContain("Return `shortlist` populated");
    expect(prompt).not.toContain("may be uncited");
  });
});
