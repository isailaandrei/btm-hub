import { describe, expect, it, vi } from "vitest";
import {
  buildPlannerCatalog,
  buildPlannerUserPrompt,
  runConstraintPlanner,
  validatePlan,
  type PlannerCatalog,
} from "./constraint-planner";
import { plannerOutputSchema } from "./schemas";
import type { AdminAiProvider } from "./provider";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

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

function recordWithProgram(id: string, program: string | null): ContactCardRecord {
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
        program,
        status: "reviewing",
        answers: {},
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

type CompleteJson = NonNullable<AdminAiProvider["completeJson"]>;

function makeProvider(completeJson?: CompleteJson): AdminAiProvider {
  return {
    isConfigured: () => true,
    getUnavailableReason: () => null,
    getModel: () => "deepseek-v4-pro",
    generate: vi.fn() as unknown as AdminAiProvider["generate"],
    completeJson,
  };
}

describe("buildPlannerCatalog", () => {
  it("derives tag categories and structured fields, excluding tag meta columns", () => {
    const records = [
      recordWithTags("a", [
        { categoryName: "26 Coral Catch", tagName: "Interested" },
        { categoryName: "26 Coral Catch", tagName: "Declined" },
      ]),
    ];
    const catalog = buildPlannerCatalog(records);

    const coral = catalog.tagCategories.find((c) => c.name === "26 Coral Catch");
    expect(coral?.tags.sort()).toEqual(["Declined", "Interested"]);
    // Only option-backed fields survive; every catalog field has options.
    expect(catalog.fields.length).toBeGreaterThan(0);
    expect(catalog.fields.every((f) => (f.options?.length ?? 0) > 0)).toBe(true);
    // With no array-valued answers present, list-valued `languages` and unbacked
    // meta columns are excluded.
    expect(catalog.fields.some((f) => f.key === "languages")).toBe(false);
    expect(catalog.fields.some((f) => f.key === "program")).toBe(false);
    expect(catalog.fields.some((f) => f.key === "tag_ids")).toBe(false);
    expect(catalog.fields.some((f) => f.key === "tag_names")).toBe(false);
  });

  it("admits a list-valued answer field with a sampled value list, excluding essay text", () => {
    const records = [
      recordWithAnswers("a", {
        languages: ["Spanish", "English"],
        ultimate_vision: "I want to film Spanish coastlines.",
      }),
      recordWithAnswers("b", {
        languages: ["Spanish", "French"],
        ultimate_vision: "A different essay entirely.",
      }),
    ];
    const catalog = buildPlannerCatalog(records);

    const languages = catalog.fields.find((f) => f.key === "languages");
    expect(languages).toBeDefined();
    expect(languages?.op).toBe("contains");
    // Spanish (freq 2) leads; the sample keeps the discrete controlled values.
    expect(languages?.values?.[0]).toBe("Spanish");
    expect(languages?.values).toEqual(
      expect.arrayContaining(["Spanish", "English", "French"]),
    );
    // A single-string essay field is NOT array-valued, so it is never admitted.
    expect(catalog.fields.some((f) => f.key === "ultimate_vision")).toBe(false);
  });

  it("derives the program vocabulary at runtime from distinct non-null applications.program values", () => {
    const records = [
      recordWithAnswers("a", {}), // program: "freediving" (recordWithAnswers default)
      recordWithProgram("b", "internship"),
      recordWithProgram("c", "internship"),
      recordWithProgram("d", "photography"),
      recordWithProgram("e", null),
    ];
    const catalog = buildPlannerCatalog(records);

    // Distinct, deduped, sorted, excluding null/empty — never hardcoded.
    expect(catalog.programs).toEqual(["freediving", "internship", "photography"]);
  });

  it("returns an empty program vocabulary when no record has an application", () => {
    const records = [recordWithTags("a", [{ categoryName: "X Y Z", tagName: "Interested" }])];
    const catalog = buildPlannerCatalog(records);
    expect(catalog.programs).toEqual([]);
  });
});

describe("buildPlannerUserPrompt", () => {
  it("puts the catalog first and the question last", () => {
    const catalog: PlannerCatalog = { tagCategories: [], fields: [], programs: [] };
    const prompt = buildPlannerUserPrompt({ catalog, question: "who freedives?" });
    expect(prompt.indexOf('"catalog"')).toBeLessThan(prompt.indexOf('"question"'));
  });
});

describe("plannerOutputSchema", () => {
  it("accepts a well-formed plan (including a program constraint and a multi-value field constraint) and defaults a partial one", () => {
    expect(
      plannerOutputSchema.safeParse({
        tagConstraint: { category: "X", includeStatuses: ["Interested"] },
        programConstraint: "internship",
        budgetMin: 6000,
        fieldConstraints: [
          { field: "certification_level", op: "eq", value: "Advanced Freediver" },
          { field: "age", op: "contains", value: ["18-24", "25-34"] },
        ],
        enumerationOnly: true,
        notes: "n",
      }).success,
    ).toBe(true);
    expect(plannerOutputSchema.parse({})).toEqual({
      tagConstraint: null,
      programConstraint: null,
      budgetMin: null,
      fieldConstraints: [],
      enumerationOnly: false,
      notes: "",
    });
  });

  it("rejects an unknown field-constraint op", () => {
    expect(
      plannerOutputSchema.safeParse({
        fieldConstraints: [{ field: "program", op: "gt", value: "x" }],
      }).success,
    ).toBe(false);
  });

  it("accepts the `in` op (the code-side multi-value normalization result)", () => {
    expect(
      plannerOutputSchema.safeParse({
        fieldConstraints: [
          { field: "age", op: "in", value: ["18-24", "25-34"] },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("validatePlan", () => {
  const catalog: PlannerCatalog = {
    tagCategories: [{ name: "26 Coral Catch", tags: ["Interested", "Declined"] }],
    fields: [
      {
        key: "certification_level",
        label: "Certification Level",
        options: ["Advanced Freediver", "Beginner"],
      },
    ],
    programs: ["freediving", "internship"],
  };

  it("keeps canonical casing and an option-matched field, drops unknown tags/fields", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        tagConstraint: {
          category: "26 coral catch",
          includeStatuses: ["Interested", "Joining"],
        },
        fieldConstraints: [
          { field: "certification_level", op: "eq", value: "Advanced Freediver" },
          { field: "nonsense", op: "eq", value: "x" },
        ],
      }),
      catalog,
    );

    expect(plan.tagConstraint).toEqual({
      category: "26 Coral Catch",
      includeStatuses: ["Interested"],
    });
    // Op is normalized to `contains` at grounding regardless of what was emitted.
    expect(plan.fieldConstraints).toEqual([
      { field: "certification_level", op: "contains", value: "Advanced Freediver" },
    ]);
    expect(droppedParts.some((p) => p.includes("Joining"))).toBe(true);
    expect(droppedParts.some((p) => p.includes("nonsense"))).toBe(true);
  });

  it("drops a field-constraint whose value is not an exact vocabulary item", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "certification_level", op: "contains", value: "spanish" },
        ],
      }),
      catalog,
    );
    expect(plan.fieldConstraints).toEqual([]);
    expect(
      droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("accepts a contains constraint on a list-valued field, still dropping unknown fields", () => {
    const listCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "languages",
          label: "Languages",
          op: "contains",
          values: ["Spanish", "English", "French"],
        },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "languages", op: "contains", value: "spanish" },
          { field: "essay", op: "contains", value: "ocean" },
        ],
      }),
      listCatalog,
    );
    expect(plan.fieldConstraints).toEqual([
      { field: "languages", op: "contains", value: "spanish" },
    ]);
    expect(droppedParts.some((p) => p.includes("essay"))).toBe(true);
  });

  it("drops a list-field value absent from the sampled values", () => {
    const listCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        { key: "languages", label: "Languages", op: "contains", values: ["Spanish"] },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [{ field: "languages", op: "contains", value: "klingon" }],
      }),
      listCatalog,
    );
    expect(plan.fieldConstraints).toEqual([]);
    expect(
      droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("drops a list-field value that only appears inside a longer item (quality-word trap)", () => {
    const listCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "equipment_owned",
          label: "Equipment Owned",
          op: "contains",
          values: ["Professional video camera", "Entry-level DSLR", "GoPro"],
        },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "equipment_owned", op: "contains", value: "Professional" },
        ],
      }),
      listCatalog,
    );
    // "Professional" is a quality word INSIDE "Professional video camera", not a
    // whole vocabulary item — it must not ground a hard filter (that is the live
    // bug where a 15-person cohort collapsed to 1).
    expect(plan.fieldConstraints).toEqual([]);
    expect(
      droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("grounds a list-field value equal to a whole multi-word vocabulary item (trim/case-insensitive)", () => {
    const listCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "equipment_owned",
          label: "Equipment Owned",
          op: "contains",
          values: ["Professional video camera", "GoPro"],
        },
      ],
      programs: [],
    };
    const { plan } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          {
            field: "equipment_owned",
            op: "contains",
            value: "  professional video camera  ",
          },
        ],
      }),
      listCatalog,
    );
    // The FULL item (trimmed, case-insensitive) is legitimate set membership.
    expect(plan.fieldConstraints).toEqual([
      {
        field: "equipment_owned",
        op: "contains",
        value: "  professional video camera  ",
      },
    ]);
  });

  it("grounds an option-backed field only by a whole option (case/space-insensitive), dropping a substring", () => {
    const whole = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "certification_level", op: "eq", value: "  advanced freediver  " },
        ],
      }),
      catalog,
    );
    // A whole option — trimmed, case-insensitive — grounds; op normalized to
    // `contains` even though the planner emitted `eq`.
    expect(whole.plan.fieldConstraints).toEqual([
      { field: "certification_level", op: "contains", value: "  advanced freediver  " },
    ]);
    const substring = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "certification_level", op: "contains", value: "advanced" },
        ],
      }),
      catalog,
    );
    // A substring of an option no longer grounds — unified whole-item rule.
    expect(substring.plan.fieldConstraints).toEqual([]);
    expect(
      substring.droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("drops a substring of an option-backed multiselect item (equipment quality-word trap)", () => {
    const optionCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "equipment_owned",
          label: "Equipment Owned",
          options: [
            "Professional video camera",
            "Action camera (GoPro, Osmo, Insta360, etc)",
            "Lighting equipment",
          ],
        },
      ],
      programs: [],
    };
    // "Professional" is a substring of the OPTION "Professional video camera" — a
    // quality word, not set membership. This is the live bug (an option-backed
    // multiselect, NOT a list-valued field); the unified rule drops it.
    const dropped = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "equipment_owned", op: "contains", value: "Professional" },
        ],
      }),
      optionCatalog,
    );
    expect(dropped.plan.fieldConstraints).toEqual([]);
    expect(
      dropped.droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);

    // The whole option copied verbatim still grounds (legitimate set membership);
    // the emitted `eq` is normalized to `contains`.
    const grounded = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "equipment_owned", op: "eq", value: "Professional video camera" },
        ],
      }),
      optionCatalog,
    );
    expect(grounded.plan.fieldConstraints).toEqual([
      { field: "equipment_owned", op: "contains", value: "Professional video camera" },
    ]);
  });

  it("normalizes a grounded constraint's op to contains regardless of the emitted op", () => {
    const emittedEq = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "certification_level", op: "eq", value: "Beginner" },
        ],
      }),
      catalog,
    );
    expect(emittedEq.plan.fieldConstraints).toEqual([
      { field: "certification_level", op: "contains", value: "Beginner" },
    ]);
  });

  it("drops a free-text / unknown field with an evidence-scan disclosure", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [{ field: "languages", op: "contains", value: "spanish" }],
      }),
      catalog,
    );
    expect(plan.fieldConstraints).toEqual([]);
    expect(
      droppedParts.some((p) => p.includes("left to the evidence scan")),
    ).toBe(true);
  });

  // --- Program constraint (GAP 1: program as a hard tag-class constraint) ---

  it("grounds a program constraint equal to a whole runtime-vocabulary item (trim/case-insensitive)", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({ programConstraint: "  Internship  " }),
      catalog, // catalog.programs === ["freediving", "internship"]
    );
    // Canonical casing from the catalog is kept, not the planner's emitted casing.
    expect(plan.programConstraint).toBe("internship");
    expect(droppedParts).toEqual([]);
  });

  it("drops a program constraint absent from the runtime vocabulary, disclosed like a field drop", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({ programConstraint: "underwater-basketry" }),
      catalog,
    );
    expect(plan.programConstraint).toBeNull();
    expect(
      droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("drops a program constraint that only substring-matches a vocabulary item (quality/fragment trap)", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({ programConstraint: "intern" }),
      catalog,
    );
    expect(plan.programConstraint).toBeNull();
    expect(
      droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("passes through a null program constraint untouched", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({ programConstraint: null }),
      catalog,
    );
    expect(plan.programConstraint).toBeNull();
    expect(droppedParts).toEqual([]);
  });

  // --- Multi-value field constraints (GAP 2) ---

  it("grounds ALL valid items of a multi-value field constraint as an array with op 'in'", () => {
    const ageCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "age",
          label: "Age Range",
          options: ["18-24", "25-34", "35-44", "45-54", "55+"],
        },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "age", op: "contains", value: ["18-24", "25-34"] },
        ],
      }),
      ageCatalog,
    );
    expect(plan.fieldConstraints).toEqual([
      { field: "age", op: "in", value: ["18-24", "25-34"] },
    ]);
    expect(droppedParts).toEqual([]);
  });

  it("drops only the invalid items of a partially-valid multi-value constraint, keeping the constraint as wide as what grounded", () => {
    const ageCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "age",
          label: "Age Range",
          options: ["18-24", "25-34", "35-44", "45-54", "55+"],
        },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "age", op: "contains", value: ["18-24", "25-34", "ancient"] },
        ],
      }),
      ageCatalog,
    );
    // Only the invalid item is dropped; the two valid ones stay — never narrower
    // than what validly grounded.
    expect(plan.fieldConstraints).toEqual([
      { field: "age", op: "in", value: ["18-24", "25-34"] },
    ]);
    expect(
      droppedParts.some(
        (p) => p.includes("ancient") && p.includes("not an exact vocabulary item"),
      ),
    ).toBe(true);
  });

  it("collapses a multi-value constraint to a scalar (op 'contains') when only ONE item survives grounding", () => {
    const ageCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "age",
          label: "Age Range",
          options: ["18-24", "25-34", "35-44", "45-54", "55+"],
        },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "age", op: "contains", value: ["18-24", "ancient"] },
        ],
      }),
      ageCatalog,
    );
    expect(plan.fieldConstraints).toEqual([
      { field: "age", op: "contains", value: "18-24" },
    ]);
    expect(
      droppedParts.some((p) => p.includes("not an exact vocabulary item")),
    ).toBe(true);
  });

  it("drops the WHOLE multi-value constraint when no item grounds", () => {
    const ageCatalog: PlannerCatalog = {
      tagCategories: [],
      fields: [
        {
          key: "age",
          label: "Age Range",
          options: ["18-24", "25-34", "35-44", "45-54", "55+"],
        },
      ],
      programs: [],
    };
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        fieldConstraints: [
          { field: "age", op: "contains", value: ["ancient", "prehistoric"] },
        ],
      }),
      ageCatalog,
    );
    expect(plan.fieldConstraints).toEqual([]);
    expect(
      droppedParts.filter((p) => p.includes("not an exact vocabulary item")),
    ).toHaveLength(2);
  });
});

describe("runConstraintPlanner", () => {
  it("returns null when the provider has no completeJson", async () => {
    const result = await runConstraintPlanner({
      provider: makeProvider(undefined),
      records: [],
      question: "q",
    });
    expect(result).toBeNull();
  });

  it("returns null when completeJson throws", async () => {
    const result = await runConstraintPlanner({
      provider: makeProvider(vi.fn().mockRejectedValue(new Error("boom"))),
      records: [],
      question: "q",
    });
    expect(result).toBeNull();
  });

  it("returns null when the JSON fails the schema", async () => {
    const result = await runConstraintPlanner({
      provider: makeProvider(
        vi.fn().mockResolvedValue({
          json: { fieldConstraints: [{ field: "program", op: "bogus", value: "x" }] },
          modelMetadata: {},
        }),
      ),
      records: [],
      question: "q",
    });
    expect(result).toBeNull();
  });

  it("returns a validated plan on success", async () => {
    const records = [
      recordWithTags("a", [
        { categoryName: "26 Coral Catch", tagName: "Interested" },
      ]),
    ];
    const run = await runConstraintPlanner({
      provider: makeProvider(
        vi.fn().mockResolvedValue({
          json: {
            tagConstraint: {
              category: "26 Coral Catch",
              includeStatuses: ["Interested"],
            },
            budgetMin: null,
            fieldConstraints: [],
            notes: "cohort",
          },
          modelMetadata: {},
        }),
      ),
      records,
      question: "who is interested in 26 Coral Catch?",
    });

    expect(run?.plan.tagConstraint).toEqual({
      category: "26 Coral Catch",
      includeStatuses: ["Interested"],
    });
    expect(run?.droppedParts).toEqual([]);
  });

  it("catalogs the runtime program vocabulary and validates a program-cohort plan end-to-end", async () => {
    const records = [recordWithProgram("a", "internship")];
    let capturedCatalog: PlannerCatalog | undefined;
    const run = await runConstraintPlanner({
      provider: makeProvider(
        vi.fn().mockImplementation(async ({ userPrompt }: { userPrompt: string }) => {
          capturedCatalog = (JSON.parse(userPrompt) as { catalog: PlannerCatalog }).catalog;
          return {
            json: {
              tagConstraint: null,
              programConstraint: "internship",
              budgetMin: null,
              fieldConstraints: [],
              enumerationOnly: false,
              notes: "internship cohort",
            },
            modelMetadata: {},
          };
        }),
      ),
      records,
      question: "Filter through the internship applicants.",
    });

    expect(capturedCatalog?.programs).toEqual(["internship"]);
    expect(run?.plan.programConstraint).toBe("internship");
    expect(run?.droppedParts).toEqual([]);
  });
});
