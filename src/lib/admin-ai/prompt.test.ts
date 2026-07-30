import { describe, expect, it } from "vitest";
import {
  buildAdminAiResponseJsonSchema,
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
  normalizeProviderResponse,
} from "./prompt";
import type { AdminAiSynthesisInput } from "./prompt";
import { adminAiResponseSchema } from "./schemas";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

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

  it("instructs the top-10 ranked + assumptions + additionalMatches contract", () => {
    const prompt = buildAdminAiSystemPrompt("global");

    expect(prompt).toContain(
      "`assumptions` holds ONLY genuine interpretive judgment calls",
    );
    expect(prompt).toContain("at most 4 entries");
    expect(prompt).toContain("NEVER put in `assumptions`");
    expect(prompt).toContain(
      "Rank the `shortlist` by likelihood of matching the query",
    );
    expect(prompt).toContain("maximum 10 entries");
    expect(prompt).toContain("goes into `additionalMatches`");
    expect(prompt).toContain("Prefer a tighter shortlist");
    // The old exhaustiveness framing is gone.
    expect(prompt).not.toContain("be exhaustive");
  });

  it("narrows the named-cohort tag rule to existing-roster questions and adds a prospecting counterpart (Change 3, 2026-07-30)", () => {
    const prompt = buildAdminAiSystemPrompt("global");

    // Roster rule: scoped to EXISTING-pipeline questions, preserving the
    // original "tags are authoritative" semantics.
    expect(prompt).toContain(
      "When the question asks about the EXISTING members, status, or roster of a named program, trip, or cohort",
    );
    expect(prompt).toContain(
      "tags in the matching tag category are the authoritative cohort marker: only contacts carrying a tag in that category qualify",
    );
    // The old, unscoped sentence is gone — replaced, not just supplemented.
    expect(prompt).not.toContain(
      "When the question targets a named program, trip, or cohort, tags in the matching",
    );
    // Prospecting rule: the supplied cards are already pre-filtered; absence
    // of the tag must never read as a concern.
    expect(prompt).toContain(
      "When the question asks to FIND NEW candidates for a named program, trip, or cohort",
    );
    expect(prompt).toContain(
      "the supplied cards have ALREADY been filtered to contacts not yet tagged in that category",
    );
    expect(prompt).toContain(
      "Never treat the absence of that category's tag as a concern",
    );
  });

  it("instructs the model never to re-tighten an applied gte filter and treats a stated price as an affordability floor (Change 5, 2026-07-30)", () => {
    const prompt = buildAdminAiSystemPrompt("global");

    expect(prompt).toContain(
      "the 'Applied filter' lines in `uncertainty` are the authoritative record",
    );
    expect(prompt).toContain(
      "never convert a minimum (op `gte`) into an exact match",
    );
    expect(prompt).toContain("Never write your own 'Applied filter' lines");
    expect(prompt).toContain("that price is an affordability floor for candidates");
    expect(prompt).toContain(
      "a budget above the price is a positive signal, never a concern",
    );
    expect(prompt).toContain(
      "only a budget strictly below the price is a mismatch",
    );
  });
});

function makeSynthesisInput(): AdminAiSynthesisInput {
  return {
    question: "who has their own projects in mind?",
    scope: "global",
    includeEvidence: false,
    queryPlan: {
      mode: "global_search",
      structuredFilters: [],
      textFocus: ["projects"],
      requestedLimit: 10,
    },
    cards: [
      { contactId: CONTACT_ID, contactName: "Yang Yang", text: "Card", evidence: [] },
    ],
    evidence: [],
  };
}

describe("buildAdminAiUserPrompt", () => {
  it("includes assumptions and additionalMatches in the response contract", () => {
    const parsed = JSON.parse(buildAdminAiUserPrompt(makeSynthesisInput())) as {
      responseContract: {
        assumptions?: unknown;
        additionalMatches?: Array<Record<string, unknown>>;
      };
    };

    expect(parsed.responseContract.assumptions).toEqual(["string"]);
    expect(parsed.responseContract.additionalMatches?.[0]).toEqual({
      contactId: "uuid",
      contactName: "string",
      reason: "string",
      matchStrength: 0,
    });
  });
});

describe("buildAdminAiResponseJsonSchema", () => {
  it("requires assumptions and additionalMatches (capped, citation-free)", () => {
    const schema = buildAdminAiResponseJsonSchema({
      includeEvidence: true,
    }) as unknown as {
      required: string[];
      properties: {
        assumptions: { type: string };
        additionalMatches: {
          maxItems: number;
          items: { properties: Record<string, unknown>; required: string[] };
        };
      };
    };

    expect(schema.required).toContain("assumptions");
    expect(schema.required).toContain("additionalMatches");
    expect(schema.properties.assumptions.type).toBe("array");
    expect(schema.properties.additionalMatches.maxItems).toBe(40);
    expect(schema.properties.additionalMatches.items.required).toEqual([
      "contactId",
      "contactName",
      "reason",
      "matchStrength",
    ]);
    expect(schema.properties.additionalMatches.items.properties).not.toHaveProperty(
      "citations",
    );
  });
});

describe("adminAiResponseSchema matchStrength", () => {
  function shortlistEntry(matchStrength?: number) {
    return {
      contactId: CONTACT_ID,
      contactName: "X",
      whyFit: [],
      concerns: [],
      citations: [],
      ...(matchStrength === undefined ? {} : { matchStrength }),
    };
  }

  it("enforces the 0-100 integer bound on shortlist matchStrength", () => {
    expect(
      adminAiResponseSchema.safeParse({
        uncertainty: [],
        shortlist: [shortlistEntry(150)],
      }).success,
    ).toBe(false);
    expect(
      adminAiResponseSchema.safeParse({
        uncertainty: [],
        shortlist: [shortlistEntry(88)],
      }).success,
    ).toBe(true);
  });

  it("defaults a missing matchStrength to 0 (tolerant of pre-normalization fixtures)", () => {
    const parsed = adminAiResponseSchema.parse({
      uncertainty: [],
      shortlist: [shortlistEntry()],
    });
    expect(parsed.shortlist?.[0]?.matchStrength).toBe(0);
  });

  it("accepts a non-uuid contactId (the id-integrity repair handles bad ids post-parse)", () => {
    const parsed = adminAiResponseSchema.safeParse({
      uncertainty: [],
      shortlist: [
        {
          contactId: "garbled-not-a-uuid",
          contactName: "X",
          whyFit: [],
          concerns: [],
          citations: [],
          matchStrength: 50,
        },
      ],
      additionalMatches: [
        { contactId: "also-garbled", contactName: "Y", reason: "r", matchStrength: 10 },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("normalizeProviderResponse", () => {
  it("defaults assumptions to [] and additionalMatches to undefined", () => {
    const normalized = normalizeProviderResponse(
      { shortlist: [], contactAssessment: null, uncertainty: [] },
      "global",
    );

    expect(normalized.assumptions).toEqual([]);
    expect(normalized.additionalMatches).toBeUndefined();
  });

  it("keeps assumptions and strips stray fields from additionalMatches", () => {
    const normalized = normalizeProviderResponse(
      {
        assumptions: ["Only counted named projects."],
        shortlist: [],
        additionalMatches: [
          {
            contactId: CONTACT_ID,
            contactName: "Yang Yang",
            reason: "Call note names a specific concept.",
            // A model sneaking a citations field must be stripped.
            citations: [{ evidenceId: "e1", claimKey: "k" }],
          } as never,
        ],
        contactAssessment: null,
        uncertainty: [],
      },
      "global",
    );

    expect(normalized.assumptions).toEqual(["Only counted named projects."]);
    expect(normalized.additionalMatches).toEqual([
      {
        contactId: CONTACT_ID,
        contactName: "Yang Yang",
        reason: "Call note names a specific concept.",
      },
    ]);
    expect(normalized.additionalMatches?.[0]).not.toHaveProperty("citations");
  });
});
