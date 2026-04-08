import { describe, it, expect } from "vitest";
import { buildStepSchema, buildFullSchema } from "./schema-builder";
import { getFormDefinition } from "./index"; // triggers all side-effect imports
import type {
  FieldDefinition,
  TextFieldDef,
  SelectFieldDef,
  MultiSelectFieldDef,
  RatingFieldDef,
  DateFieldDef,
  FormStepDefinition,
} from "./types";

/** Generate a valid answer for any field definition. */
function stubAnswer(field: FieldDefinition): unknown {
  switch (field.type) {
    case "text":
      if (field.storeAs === "string[]") return ["value"];
      if (field.inputType === "email") return "test@test.com";
      if (field.required === false) return "";
      return "a".repeat(Math.max(field.minLength ?? 1, 1));
    case "select":
      return field.options[0];
    case "multiselect":
      return [field.options[0]];
    case "rating":
      return 5;
    case "date":
      return field.required === false ? "" : "2026-01-01";
  }
}

/** Build a complete valid answers object from a form's steps. */
function buildValidAnswers(steps: FormStepDefinition[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const step of steps) {
    for (const field of step.fields) {
      answers[field.name] = stubAnswer(field);
    }
  }
  return answers;
}

// ---------------------------------------------------------------------------
// buildStepSchema — tests buildFieldSchema transitively
// ---------------------------------------------------------------------------

describe("buildStepSchema", () => {
  // --- Text fields ---

  it("validates required text field", () => {
    const fields: TextFieldDef[] = [
      { type: "text", name: "name", label: "Name" },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ name: "Alice" }).success).toBe(true);
    expect(schema.safeParse({ name: "" }).success).toBe(false);
  });

  it("validates optional text field", () => {
    const fields: TextFieldDef[] = [
      { type: "text", name: "note", label: "Note", required: false },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ note: "" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("validates text field with minLength", () => {
    const fields: TextFieldDef[] = [
      { type: "text", name: "bio", label: "Bio", minLength: 10, multiline: true },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ bio: "short" }).success).toBe(false);
    expect(schema.safeParse({ bio: "a".repeat(10) }).success).toBe(true);
  });

  it("validates email input type", () => {
    const fields: TextFieldDef[] = [
      { type: "text", name: "email", label: "Email", inputType: "email" },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ email: "user@test.com" }).success).toBe(true);
    expect(schema.safeParse({ email: "not-email" }).success).toBe(false);
  });

  it("validates storeAs string[]", () => {
    const fields: TextFieldDef[] = [
      { type: "text", name: "tags", label: "Tags", storeAs: "string[]" },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ tags: ["a", "b"] }).success).toBe(true);
    expect(schema.safeParse({ tags: [] }).success).toBe(false); // required by default
  });

  it("validates optional storeAs string[]", () => {
    const fields: TextFieldDef[] = [
      { type: "text", name: "tags", label: "Tags", storeAs: "string[]", required: false },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ tags: [] }).success).toBe(true);
  });

  // --- Select fields ---

  it("validates select field", () => {
    const fields: SelectFieldDef[] = [
      { type: "select", name: "level", label: "Level", options: ["beginner", "advanced"] },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ level: "beginner" }).success).toBe(true);
    expect(schema.safeParse({ level: "invalid" }).success).toBe(false);
  });

  // --- Multiselect fields ---

  it("validates multiselect field", () => {
    const fields: MultiSelectFieldDef[] = [
      { type: "multiselect", name: "skills", label: "Skills", options: ["photo", "video", "edit"] },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ skills: ["photo", "video"] }).success).toBe(true);
    expect(schema.safeParse({ skills: [] }).success).toBe(false); // required
    expect(schema.safeParse({ skills: ["invalid"] }).success).toBe(false);
  });

  it("validates optional multiselect field", () => {
    const fields: MultiSelectFieldDef[] = [
      { type: "multiselect", name: "skills", label: "Skills", options: ["a"], required: false },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ skills: [] }).success).toBe(true);
  });

  // --- Rating fields ---

  it("validates rating field (1–10 integer)", () => {
    const fields: RatingFieldDef[] = [
      { type: "rating", name: "score", label: "Score" },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ score: 5 }).success).toBe(true);
    expect(schema.safeParse({ score: 0 }).success).toBe(false);
    expect(schema.safeParse({ score: 11 }).success).toBe(false);
    expect(schema.safeParse({ score: 5.5 }).success).toBe(false);
  });

  // --- Date fields ---

  it("validates required date field", () => {
    const fields: DateFieldDef[] = [
      { type: "date", name: "dob", label: "Date of Birth" },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ dob: "2000-01-01" }).success).toBe(true);
    expect(schema.safeParse({ dob: "" }).success).toBe(false);
  });

  it("validates optional date field", () => {
    const fields: DateFieldDef[] = [
      { type: "date", name: "dob", label: "Date of Birth", required: false },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ dob: "" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildFullSchema
// ---------------------------------------------------------------------------

describe("buildFullSchema", () => {
  it("merges fields from multiple steps into flat schema", () => {
    const steps: FormStepDefinition[] = [
      {
        id: "step1",
        title: "Step 1",
        description: "",
        fields: [{ type: "text", name: "first_name", label: "First Name" }],
      },
      {
        id: "step2",
        title: "Step 2",
        description: "",
        fields: [{ type: "text", name: "email", label: "Email", inputType: "email" }],
      },
    ];

    const schema = buildFullSchema(steps, {});

    expect(
      schema.safeParse({ first_name: "Alice", email: "a@b.com" }).success,
    ).toBe(true);

    // Missing field from step 2
    expect(schema.safeParse({ first_name: "Alice" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Program form definitions
// ---------------------------------------------------------------------------

describe("filmmaking form", () => {
  it("returns a form with 9 steps", () => {
    const form = getFormDefinition("filmmaking");
    expect(form).toBeDefined();
    expect(form!.steps).toHaveLength(9);
    expect(form!.steps.map((s) => s.id)).toEqual([
      "personal",
      "health",
      "diving",
      "equipment",
      "skills",
      "creative_profile",
      "goals",
      "logistics",
      "open_questions",
    ]);
  });

  it("buildFullSchema parses valid answers", () => {
    const form = getFormDefinition("filmmaking")!;
    const answers = buildValidAnswers(form.steps);
    const schema = buildFullSchema(form.steps, answers);
    const result = schema.safeParse(answers);
    expect(result.success).toBe(true);
  });
});

describe("freediving & modelling form", () => {
  it("registers under freediving slug", () => {
    const freediving = getFormDefinition("freediving");
    expect(freediving).toBeDefined();
  });

  it("freediving form has 9 steps", () => {
    const form = getFormDefinition("freediving")!;
    expect(form.steps).toHaveLength(9);
    expect(form.steps.map((s) => s.id)).toEqual([
      "personal",
      "health",
      "freediving_experience",
      "underwater_performance",
      "equipment",
      "creative_profile",
      "goals",
      "logistics",
      "open_questions",
    ]);
  });

  it("buildFullSchema parses valid answers", () => {
    const form = getFormDefinition("freediving")!;
    const answers = buildValidAnswers(form.steps);
    const schema = buildFullSchema(form.steps, answers);
    const result = schema.safeParse(answers);
    expect(result.success).toBe(true);
  });
});

describe("internship form", () => {
  it("returns a form with 5 steps", () => {
    const form = getFormDefinition("internship");
    expect(form).toBeDefined();
    expect(form!.steps).toHaveLength(5);
    expect(form!.steps.map((s) => s.id)).toEqual([
      "personal",
      "filmmaking_experience",
      "motivation",
      "health_diving",
      "open_questions",
    ]);
  });

  it("buildFullSchema parses valid answers", () => {
    const form = getFormDefinition("internship")!;
    const answers = buildValidAnswers(form.steps);
    const schema = buildFullSchema(form.steps, answers);
    const result = schema.safeParse(answers);
    expect(result.success).toBe(true);
  });
});
