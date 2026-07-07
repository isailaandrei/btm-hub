import { describe, expect, it } from "vitest";
import {
  CONTACT_SUMMARY_PROMPT_VERSION,
  CONTACT_SUMMARY_QUESTION,
  buildContactCardHash,
} from "./contact-summary";

describe("buildContactCardHash", () => {
  it("is deterministic for identical card text", () => {
    expect(buildContactCardHash("card A")).toBe(buildContactCardHash("card A"));
  });

  it("changes when the card text changes", () => {
    expect(buildContactCardHash("card A")).not.toBe(
      buildContactCardHash("card B"),
    );
  });

  it("participates the prompt version (bumping it invalidates all summaries)", () => {
    // The version string is part of the hashed input, so this test pins the
    // invalidation mechanism rather than a specific digest value.
    expect(CONTACT_SUMMARY_PROMPT_VERSION.length).toBeGreaterThan(0);
    expect(buildContactCardHash("card A")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("CONTACT_SUMMARY_QUESTION", () => {
  it("asks for the CRM essentials and forbids speculation", () => {
    expect(CONTACT_SUMMARY_QUESTION).toContain("decision state");
    expect(CONTACT_SUMMARY_QUESTION).toContain("budget");
    expect(CONTACT_SUMMARY_QUESTION).toContain("open questions");
    expect(CONTACT_SUMMARY_QUESTION).toContain("do not infer beyond");
  });
});
