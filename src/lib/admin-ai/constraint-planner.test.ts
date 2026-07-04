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
    expect(catalog.fields.some((f) => f.key === "program")).toBe(true);
    expect(catalog.fields.some((f) => f.key === "tag_ids")).toBe(false);
    expect(catalog.fields.some((f) => f.key === "tag_names")).toBe(false);
  });
});

describe("buildPlannerUserPrompt", () => {
  it("puts the catalog first and the question last", () => {
    const catalog: PlannerCatalog = { tagCategories: [], fields: [] };
    const prompt = buildPlannerUserPrompt({ catalog, question: "who freedives?" });
    expect(prompt.indexOf('"catalog"')).toBeLessThan(prompt.indexOf('"question"'));
  });
});

describe("plannerOutputSchema", () => {
  it("accepts a well-formed plan and defaults a partial one", () => {
    expect(
      plannerOutputSchema.safeParse({
        tagConstraint: { category: "X", includeStatuses: ["Interested"] },
        budgetMin: 6000,
        fieldConstraints: [{ field: "program", op: "eq", value: "freediving" }],
        notes: "n",
      }).success,
    ).toBe(true);
    expect(plannerOutputSchema.parse({})).toEqual({
      tagConstraint: null,
      budgetMin: null,
      fieldConstraints: [],
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
});

describe("validatePlan", () => {
  const catalog: PlannerCatalog = {
    tagCategories: [{ name: "26 Coral Catch", tags: ["Interested", "Declined"] }],
    fields: [{ key: "program", label: "Program" }],
  };

  it("drops unknown categories/statuses/fields and keeps canonical casing", () => {
    const { plan, droppedParts } = validatePlan(
      plannerOutputSchema.parse({
        tagConstraint: {
          category: "26 coral catch",
          includeStatuses: ["Interested", "Joining"],
        },
        fieldConstraints: [
          { field: "program", op: "eq", value: "freediving" },
          { field: "nonsense", op: "eq", value: "x" },
        ],
      }),
      catalog,
    );

    expect(plan.tagConstraint).toEqual({
      category: "26 Coral Catch",
      includeStatuses: ["Interested"],
    });
    expect(plan.fieldConstraints).toEqual([
      { field: "program", op: "eq", value: "freediving" },
    ]);
    expect(droppedParts.some((p) => p.includes("Joining"))).toBe(true);
    expect(droppedParts.some((p) => p.includes("nonsense"))).toBe(true);
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
});
