import { describe, expect, it } from "vitest";
import {
  applyHardConstraintsToResponse,
  applyPlannedConstraints,
  budgetValueMeetsMinimum,
  extractHardConstraints,
  filterRecordsByHardConstraints,
} from "./hard-constraints";
import type { PlannerOutput } from "./schemas";
import type { AdminAiResponse } from "@/types/admin-ai";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

function plan(partial: Partial<PlannerOutput>): PlannerOutput {
  return {
    tagConstraint: null,
    programConstraint: null,
    budgetMin: null,
    fieldConstraints: [],
    enumerationOnly: false,
    notes: "",
    ...partial,
  };
}

function recordWithAnswers(
  id: string,
  answers: Record<string, unknown>,
): ContactCardRecord {
  return {
    contact: {
      id,
      name: id,
      email: null,
      phone: null,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: [
      {
        id: `${id}-app`,
        user_id: null,
        contact_id: id,
        program: "freediving",
        status: "reviewing",
        answers,
        tags: [],
        admin_notes: [],
        submitted_at: "2026-03-02T00:00:00Z",
        updated_at: "2026-03-02T00:00:00Z",
      },
    ],
    contactNotes: [],
    contactTags: [],
  } as unknown as ContactCardRecord;
}

/** A record with a configurable set of applications (program + status each). */
function recordWithApplications(
  id: string,
  applications: Array<{ program: string | null; status?: string }>,
): ContactCardRecord {
  return {
    contact: {
      id,
      name: id,
      email: null,
      phone: null,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: applications.map((app, i) => ({
      id: `${id}-app-${i}`,
      user_id: null,
      contact_id: id,
      program: app.program,
      status: app.status ?? "reviewing",
      answers: {},
      tags: [],
      admin_notes: [],
      submitted_at: "2026-03-02T00:00:00Z",
      updated_at: "2026-03-02T00:00:00Z",
    })),
    contactNotes: [],
    contactTags: [],
  } as unknown as ContactCardRecord;
}

const ALLOWED_ID = "11111111-1111-4111-8111-111111111111";
const DISALLOWED_ID = "22222222-2222-4222-8222-222222222222";

function recordWithTags(
  id: string,
  tags: Array<{ categoryName: string; tagName: string }>,
): ContactCardRecord {
  return {
    contact: {
      id,
      name: id,
      email: null,
      phone: null,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: [],
    contactNotes: [],
    contactTags: tags.map((tag, i) => ({
      tagId: `${id}-${i}`,
      tagName: tag.tagName,
      categoryName: tag.categoryName,
      assignedAt: "2026-03-02T00:00:00Z",
    })),
  } as unknown as ContactCardRecord;
}

function taggedRecord(id: string, categoryNames: string[]): ContactCardRecord {
  return recordWithTags(
    id,
    categoryNames.map((categoryName) => ({
      categoryName,
      tagName: "Potential Candidate",
    })),
  );
}

describe("admin AI hard constraints", () => {
  it("extracts minimum budget requirements from natural-language questions", () => {
    expect(
      extractHardConstraints("female candidates with budget 6k or more"),
    ).toEqual({ budgetMin: 6000 });
    expect(
      extractHardConstraints("show candidates with at least 12.5k budget"),
    ).toEqual({ budgetMin: 12500 });
  });

  it("only accepts budget bands whose lower bound meets the requested minimum", () => {
    expect(
      budgetValueMeetsMinimum("Advanced budget (3,000 - 6,000 €/USD)", 6000),
    ).toBe(false);
    expect(
      budgetValueMeetsMinimum("Professional budget (6,000 - 12,000 €/USD)", 6000),
    ).toBe(true);
    expect(
      budgetValueMeetsMinimum("All-In budget (>12,000 €/USD)", 6000),
    ).toBe(true);
    expect(budgetValueMeetsMinimum("~$8k", 6000)).toBe(true);
    expect(budgetValueMeetsMinimum("Small budget (under 1,000 €/USD)", 6000)).toBe(
      false,
    );
  });

  it("drops shortlist AND additionalMatches outside the allowed contact ids", () => {
    const response: AdminAiResponse = {
      assumptions: [],
      shortlist: [
        {
          contactId: ALLOWED_ID,
          contactName: "Kept",
          whyFit: ["fit"],
          concerns: [],
          citations: [],
        },
        {
          contactId: DISALLOWED_ID,
          contactName: "Dropped",
          whyFit: ["fit"],
          concerns: [],
          citations: [],
        },
      ],
      additionalMatches: [
        { contactId: ALLOWED_ID, contactName: "Kept", reason: "meets bar" },
        { contactId: DISALLOWED_ID, contactName: "Dropped", reason: "meets bar" },
      ],
      uncertainty: [],
    };

    const { response: filtered, droppedContactIds } =
      applyHardConstraintsToResponse({
        response,
        allowedContactIds: new Set([ALLOWED_ID]),
        constraints: { budgetMin: 6000 },
      });

    expect(filtered.shortlist?.map((e) => e.contactId)).toEqual([ALLOWED_ID]);
    expect(filtered.additionalMatches?.map((m) => m.contactId)).toEqual([
      ALLOWED_ID,
    ]);
    expect(droppedContactIds).toContain(DISALLOWED_ID);
  });

  it("extracts a distinctive tag category the question names, ignoring generic ones", () => {
    const records = [
      taggedRecord("a", ["26 Coral Catch"]),
      taggedRecord("b", ["Status", "Interested in"]),
    ];

    expect(
      extractHardConstraints("who is potential for 26 Coral Catch?", records)
        .tagCategory,
    ).toBe("26 Coral Catch");
    // Generic categories (no digit, < 3 words) never match, even if named.
    expect(
      extractHardConstraints(
        "what is their status and are they interested in it?",
        records,
      ).tagCategory,
    ).toBeUndefined();
  });

  it("filters records to members carrying a tag in the matched category", () => {
    const records = [
      taggedRecord("a", ["26 Coral Catch"]),
      taggedRecord("b", ["Some Other Cohort 2027"]),
    ];

    const result = filterRecordsByHardConstraints(records, {
      tagCategory: "26 Coral Catch",
    });

    expect(result.records.map((r) => r.contact.id)).toEqual(["a"]);
    expect(result.droppedContactIds).toEqual(["b"]);
  });

  it("excludes declined-only members for a normal cohort question, keeping mixed statuses", () => {
    const records = [
      recordWithTags("interested", [
        { categoryName: "26 Coral Catch", tagName: "Interested" },
      ]),
      recordWithTags("declined", [
        { categoryName: "26 Coral Catch", tagName: "Declined" },
      ]),
      recordWithTags("mixed", [
        { categoryName: "26 Coral Catch", tagName: "Declined" },
        { categoryName: "26 Coral Catch", tagName: "Interested" },
      ]),
    ];
    const constraints = extractHardConstraints(
      "who is interested in 26 Coral Catch?",
      records,
    );

    const result = filterRecordsByHardConstraints(records, constraints);
    expect(result.records.map((r) => r.contact.id)).toEqual([
      "interested",
      "mixed",
    ]);
    expect(result.droppedDeclinedContactIds).toEqual(["declined"]);
    expect(result.droppedContactIds).toEqual([]);
  });

  it("excludes declined-only members even when the question is about declined people (known limitation)", () => {
    const records = [
      recordWithTags("declined", [
        { categoryName: "26 Coral Catch", tagName: "Declined" },
      ]),
    ];
    const constraints = extractHardConstraints(
      "who declined 26 Coral Catch?",
      records,
    );

    const result = filterRecordsByHardConstraints(records, constraints);
    // The keyword escape hatch was removed: declined-only members are always
    // excluded once a tag category fires; the disclosure points to the Tags UI.
    expect(result.records).toEqual([]);
    expect(result.droppedDeclinedContactIds).toEqual(["declined"]);
  });
});

describe("program hard constraint (legacy fallback path)", () => {
  it("extracts a program the question names from the runtime-derived vocabulary", () => {
    const records = [
      recordWithApplications("a", [{ program: "internship" }]),
      recordWithApplications("b", [{ program: "freediving" }]),
    ];
    expect(
      extractHardConstraints("filter the internship applicants", records).program,
    ).toBe("internship");
  });

  it("does not extract a program absent from the corpus vocabulary", () => {
    const records = [recordWithApplications("a", [{ program: "internship" }])];
    expect(
      extractHardConstraints("who does freediving?", records).program,
    ).toBeUndefined();
  });

  it("keeps records with ANY matching application, case-insensitive, status-agnostic", () => {
    const records = [
      // Matches via a SECOND application; first application is a different
      // program entirely — "any application" semantics.
      recordWithApplications("multi-app", [
        { program: "photography" },
        { program: "Internship", status: "declined" },
      ]),
      recordWithApplications("single-app", [{ program: "internship", status: "accepted" }]),
      recordWithApplications("no-match", [{ program: "freediving" }]),
    ];
    const result = filterRecordsByHardConstraints(records, { program: "internship" });
    expect(result.records.map((r) => r.contact.id)).toEqual([
      "multi-app",
      "single-app",
    ]);
    expect(result.droppedProgramContactIds).toEqual(["no-match"]);
  });

  it("discloses program drops separately from budget/tag drops", () => {
    const records = [
      recordWithApplications("kept", [{ program: "internship" }]),
      recordWithApplications("dropped", [{ program: "freediving" }]),
    ];
    const result = filterRecordsByHardConstraints(records, { program: "internship" });
    expect(result.records.map((r) => r.contact.id)).toEqual(["kept"]);
    expect(result.droppedProgramContactIds).toEqual(["dropped"]);
    // Program drops are tracked SEPARATELY from the combined budget/tag list —
    // never conflated, so the orchestrator can disclose the right reason.
    expect(result.droppedContactIds).toEqual([]);
  });
});

function statusRecord(
  id: string,
  categoryName: string,
  tagNames: string[],
): ContactCardRecord {
  return {
    contact: {
      id,
      name: id,
      email: null,
      phone: null,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: [],
    contactNotes: [],
    contactTags: tagNames.map((tagName, i) => ({
      tagId: `${id}-${i}`,
      tagName,
      categoryName,
      assignedAt: "2026-03-02T00:00:00Z",
    })),
  } as unknown as ContactCardRecord;
}

describe("applyPlannedConstraints", () => {
  it("keeps only members carrying an included status", () => {
    const records = [
      statusRecord("a", "26 Coral Catch", ["Interested"]),
      statusRecord("b", "26 Coral Catch", ["Declined"]),
      statusRecord("c", "26 Coral Catch", ["Potential Candidate"]),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        tagConstraint: {
          category: "26 Coral Catch",
          includeStatuses: ["Interested", "Potential Candidate"],
        },
      }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual(["a", "c"]);
    expect(result.droppedByTag).toEqual(["b"]);
  });

  it("excludes declined-only members by default when includeStatuses is empty", () => {
    const records = [
      statusRecord("kept", "26 Coral Catch", ["Interested"]),
      statusRecord("declined", "26 Coral Catch", ["Declined"]),
      statusRecord("mixed", "26 Coral Catch", ["Declined", "Interested"]),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({ tagConstraint: { category: "26 Coral Catch", includeStatuses: [] } }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual(["kept", "mixed"]);
    expect(result.droppedByTag).toEqual(["declined"]);
  });

  it("INCLUDES declined members when includeStatuses is ['Declined']", () => {
    const records = [
      statusRecord("declined", "26 Coral Catch", ["Declined"]),
      statusRecord("interested", "26 Coral Catch", ["Interested"]),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        tagConstraint: { category: "26 Coral Catch", includeStatuses: ["Declined"] },
      }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual(["declined"]);
    expect(result.droppedByTag).toEqual(["interested"]);
  });

  it("matches field constraints with contains and eq", () => {
    const records = [
      recordWithAnswers("a", { certification_level: "Advanced Freediver" }),
      recordWithAnswers("b", { certification_level: "Beginner" }),
    ];
    expect(
      applyPlannedConstraints(
        records,
        plan({
          fieldConstraints: [
            { field: "certification_level", op: "contains", value: "advanced" },
          ],
        }),
      ).records.map((r) => r.contact.id),
    ).toEqual(["a"]);
    expect(
      applyPlannedConstraints(
        records,
        plan({
          fieldConstraints: [
            { field: "certification_level", op: "eq", value: "beginner" },
          ],
        }),
      ).records.map((r) => r.contact.id),
    ).toEqual(["b"]);
  });

  it("matches a contains constraint against array-typed answer values", () => {
    const records = [
      recordWithAnswers("multi", { languages: ["English", "Spanish", "French"] }),
      recordWithAnswers("mono", { languages: ["English"] }),
      recordWithAnswers("string", { languages: "Spanish and Portuguese" }),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [{ field: "languages", op: "contains", value: "spanish" }],
      }),
    );
    // Case-insensitive substring over each array item (and legacy string values).
    expect(result.records.map((r) => r.contact.id)).toEqual(["multi", "string"]);
    expect(result.droppedByField).toEqual(["mono"]);
  });

  it("reuses the budget comparison for budgetMin", () => {
    const records = [
      recordWithAnswers("rich", { budget: "All-In budget (>12,000 €/USD)" }),
      recordWithAnswers("poor", { budget: "Small budget (under 1,000 €/USD)" }),
    ];
    const result = applyPlannedConstraints(records, plan({ budgetMin: 6000 }));
    expect(result.records.map((r) => r.contact.id)).toEqual(["rich"]);
    expect(result.droppedByBudget).toEqual(["poor"]);
  });

  // --- Program constraint (GAP 1) ---

  it("keeps records with ANY matching application, case-insensitive, status-agnostic, tracked separately from tag/budget/field drops", () => {
    const records = [
      recordWithApplications("multi-app", [
        { program: "photography" },
        { program: "INTERNSHIP", status: "declined" },
      ]),
      recordWithApplications("single-app", [{ program: "internship" }]),
      recordWithApplications("no-match", [{ program: "freediving" }]),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({ programConstraint: "internship" }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual([
      "multi-app",
      "single-app",
    ]);
    expect(result.droppedByProgram).toEqual(["no-match"]);
    expect(result.droppedByTag).toEqual([]);
    expect(result.droppedByBudget).toEqual([]);
    expect(result.droppedByField).toEqual([]);
  });

  it("applies program before budget/field so downstream filters only see program members", () => {
    const records = [
      recordWithApplications("in-program-poor", [{ program: "internship" }]),
      recordWithApplications("out-of-program-rich", [{ program: "freediving" }]),
    ];
    // in-program-poor has no budget answer at all (fails budget); the OTHER
    // program's contact never even reaches the budget check for disclosure
    // purposes — it is dropped by program first.
    const result = applyPlannedConstraints(
      records,
      plan({ programConstraint: "internship", budgetMin: 6000 }),
    );
    expect(result.droppedByProgram).toEqual(["out-of-program-rich"]);
    expect(result.droppedByBudget).toEqual(["in-program-poor"]);
    expect(result.records).toEqual([]);
  });

  // --- Multi-value field constraint applier (GAP 2) ---

  it("intersects a multi-value (array) constraint against a scalar answer", () => {
    const records = [
      recordWithAnswers("young", { age: "18-24" }),
      recordWithAnswers("mid", { age: "25-34" }),
      recordWithAnswers("old", { age: "55+" }),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [
          { field: "age", op: "in", value: ["18-24", "25-34"] },
        ],
      }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual(["young", "mid"]);
    expect(result.droppedByField).toEqual(["old"]);
  });

  it("intersects a multi-value (array) constraint against a list-valued (array) answer", () => {
    const records = [
      recordWithAnswers("spanish-speaker", { languages: ["Spanish", "English"] }),
      recordWithAnswers("french-speaker", { languages: ["French"] }),
      recordWithAnswers("german-speaker", { languages: ["German"] }),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [
          { field: "languages", op: "in", value: ["spanish", "french"] },
        ],
      }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual([
      "spanish-speaker",
      "french-speaker",
    ]);
    expect(result.droppedByField).toEqual(["german-speaker"]);
  });

  // --- Age-normalized field matching (§6 refinement, GAP 2 follow-up) ---
  // `recordMatchesFieldConstraint` runs each record's raw field value through
  // the registry's `canonical.normalize` hook (generic — driven by whatever
  // `getFieldEntry(field)?.canonical?.normalize` returns) before the
  // intersection test. `age` is currently the only field with a normalizer
  // (`normalizeAgeToRange` in field-registry.ts), so raw internship numeric
  // text like "21" now matches its AGE_RANGES bucket at the deterministic
  // prefilter stage instead of missing it and relying on the rescue scan.

  it("matches a raw numeric age value against its bucket via the registry normalizer", () => {
    const records = [
      // Internship applications store age as raw numeric text.
      recordWithAnswers("raw-21", { age: "21" }),
      recordWithAnswers("raw-40", { age: "40" }),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [
          { field: "age", op: "in", value: ["18-24", "25-34"] },
        ],
      }),
    );
    // "21" normalizes to "18-24" (in range) and matches; "40" normalizes to
    // "35-44" (out of range) and is dropped.
    expect(result.records.map((r) => r.contact.id)).toEqual(["raw-21"]);
    expect(result.droppedByField).toEqual(["raw-40"]);
  });

  it("still matches an already-canonical, bucket-stored age value", () => {
    const records = [
      recordWithAnswers("bucketed", { age: "18-24" }),
      recordWithAnswers("other-bucket", { age: "55+" }),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [{ field: "age", op: "in", value: ["18-24"] }],
      }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual(["bucketed"]);
    expect(result.droppedByField).toEqual(["other-bucket"]);
  });

  it("does not match a non-normalizable garbage age value (falls through to no match / rescue pool)", () => {
    const records = [recordWithAnswers("garbage", { age: "not an age" })];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [
          { field: "age", op: "in", value: ["18-24", "25-34"] },
        ],
      }),
    );
    expect(result.records).toEqual([]);
    expect(result.droppedByField).toEqual(["garbage"]);
  });

  it("leaves fields WITHOUT a canonical.normalize hook unaffected (raw comparison only)", () => {
    const records = [
      recordWithAnswers("advanced", { certification_level: "Advanced Freediver" }),
      recordWithAnswers("beginner", { certification_level: "Beginner" }),
    ];
    const result = applyPlannedConstraints(
      records,
      plan({
        fieldConstraints: [
          { field: "certification_level", op: "contains", value: "advanced" },
        ],
      }),
    );
    expect(result.records.map((r) => r.contact.id)).toEqual(["advanced"]);
    expect(result.droppedByField).toEqual(["beginner"]);
  });
});
