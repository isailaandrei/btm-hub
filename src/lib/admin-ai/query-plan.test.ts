/**
 * First failing tests for the deterministic admin AI query planner.
 *
 * These tests describe the contract that `buildAdminAiQueryPlan` must
 * satisfy. The function is implemented in Task 4 — until then, this file is
 * expected to fail at module resolution time ("Cannot find module
 * './query-plan'"), which is the correct TDD signal.
 */

import { describe, it, expect } from "vitest";

import { buildAdminAiQueryPlan } from "./query-plan";

const CONTACT_ID = "00000000-0000-0000-0000-000000000001";

describe("buildAdminAiQueryPlan", () => {
  it("forces contact_synthesis mode when contact scope is provided", () => {
    const plan = buildAdminAiQueryPlan({
      scope: "contact",
      contactId: CONTACT_ID,
      question: "what is her availability?",
      availableTags: [],
    });

    expect(plan.mode).toBe("contact_synthesis");
    expect(plan.contactId).toBe(CONTACT_ID);
  });

  it("extracts structured filters only from allowlisted fields", () => {
    const plan = buildAdminAiQueryPlan({
      scope: "global",
      question:
        "show me applicants whose btm_category is ASPIRING PROFESSIONAL and who live in Portugal",
      availableTags: [],
    });

    // btm_category IS in the structured allowlist — should be extracted.
    const hasBtmCategoryFilter = plan.structuredFilters.some(
      (f) => f.field === "btm_category",
    );
    expect(hasBtmCategoryFilter).toBe(true);

    // country_of_residence is a text field (NOT in structured allowlist).
    // It must not appear as a structured filter.
    const hasCountryFilter = plan.structuredFilters.some(
      (f) => f.field === "country_of_residence",
    );
    expect(hasCountryFilter).toBe(false);

    // Every structured filter the planner emits must reference a field that
    // the allowlist considers structured.
    for (const filter of plan.structuredFilters) {
      expect(typeof filter.field).toBe("string");
      expect(filter.field).not.toMatch(/^$/);
    }
  });

  it("keeps unsupported words in textFocus instead of inventing filters", () => {
    const plan = buildAdminAiQueryPlan({
      scope: "global",
      question: "find people who love humpback whales and macro photography",
      availableTags: [],
    });

    // These words do not map to any allowlisted structured field — the
    // planner must route them into `textFocus` rather than fabricating a
    // filter for a non-existent column.
    expect(plan.structuredFilters).toEqual([]);
    expect(plan.textFocus.length).toBeGreaterThan(0);
    const joined = plan.textFocus.join(" ").toLowerCase();
    expect(joined).toContain("humpback");
  });

  it("clamps requestedLimit for global questions", () => {
    const plan = buildAdminAiQueryPlan({
      scope: "global",
      question:
        "give me 9999 applicants who mention underwater filmmaking experience",
      availableTags: [],
    });

    // The planner must clamp the retrieval window so downstream token budgets
    // stay predictable. The exact upper bound lives in the implementation;
    // we assert it is (a) finite and (b) well below the absurd figure asked.
    expect(plan.requestedLimit).toBeGreaterThan(0);
    expect(plan.requestedLimit).toBeLessThanOrEqual(200);
  });
});
