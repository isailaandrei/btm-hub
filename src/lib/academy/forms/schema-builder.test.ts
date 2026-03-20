import { describe, it, expect } from "vitest";
import { buildStepSchema, buildFullSchema } from "./schema-builder";
import { getFormDefinition } from "./index"; // triggers all side-effect imports
import type {
  TextFieldDef,
  SelectFieldDef,
  MultiSelectFieldDef,
  RatingFieldDef,
  DateFieldDef,
  FormStepDefinition,
} from "./types";

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
  it("returns a form with 10 steps", () => {
    const form = getFormDefinition("filmmaking");
    expect(form).toBeDefined();
    expect(form!.steps).toHaveLength(10);
    expect(form!.steps.map((s) => s.id)).toEqual([
      "personal",
      "background",
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

  it("buildFullSchema parses realistic answers", () => {
    const form = getFormDefinition("filmmaking")!;
    const schema = buildFullSchema(form.steps, {});

    const answers = {
      // personal
      first_name: "Test", last_name: "User", nickname: "Tester",
      email: "test@test.com", phone: "123456", age: "25-34", gender: "Male",
      // background
      nationality: "German", country_of_residence: "Germany",
      languages: "English", current_occupation: "Filmmaker",
      // health
      physical_fitness: "Good", health_conditions: "None",
      // diving
      diving_types: ["Scuba diving"], certification_level: "Advanced Open Water (AOW)",
      number_of_dives: "51-100", last_dive_date: "2026-01-01",
      diving_environments: ["Reef"], buoyancy_skill: 7,
      // equipment
      equipment_owned: ["Camera"], filming_equipment: "Sony A7SIII + Seafrogs housing",
      planning_to_invest: "Yes, moderate investment planned",
      // skills
      years_experience: "3-5 years",
      skill_camera_settings: 7, skill_lighting: 5, skill_post_production: 6,
      skill_color_correction: 4, skill_storytelling: 8, skill_drone: 3, skill_over_water: 5,
      // creative profile
      content_created: ["Documentary style"], btm_category: "Enthusiast",
      involvement_level: "Part-time", online_presence: "Dedicated filming social media",
      income_from_filming: "Occasional / side income",
      // goals
      primary_goal: "Improve existing skills",
      learning_aspects: ["Lighting techniques"],
      content_to_create: ["Documentary style films"],
      learning_approach: ["One-on-one mentorship"],
      marine_subjects: ["Coral reefs"],
      // logistics
      time_availability: "2-4 weeks", travel_willingness: "Yes, anywhere",
      budget: "$3,000 - $5,000", start_timeline: "Within 3 months",
      // open questions
      ultimate_vision: "To create compelling underwater documentaries",
      inspiration_to_apply: "Passion for the ocean and storytelling",
      referral_source: ["Social media"],
    };

    const result = schema.safeParse(answers);
    expect(result.success).toBe(true);
  });
});

describe("freediving & modelling form", () => {
  it("registers under freediving slug", () => {
    const freediving = getFormDefinition("freediving");
    expect(freediving).toBeDefined();
  });

  it("freediving form has 10 steps", () => {
    const form = getFormDefinition("freediving")!;
    expect(form.steps).toHaveLength(10);
    expect(form.steps.map((s) => s.id)).toEqual([
      "personal",
      "background",
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

  it("buildFullSchema parses realistic answers", () => {
    const form = getFormDefinition("freediving")!;
    const schema = buildFullSchema(form.steps, {});

    const answers = {
      // personal
      first_name: "Test", last_name: "User", nickname: "Tester",
      email: "test@test.com", phone: "123456", age: "25-34", gender: "Female",
      // background
      nationality: "French", country_of_residence: "Portugal",
      languages: "French, English", current_occupation: "Freediver",
      // health
      physical_fitness: "Excellent", health_conditions: "None",
      // freediving experience
      certification_level: "AIDA 3 or equivalent",
      number_of_sessions: "51-250", practice_duration: "> 2 years",
      last_session_date: "2026-01-15",
      comfortable_max_depth: "25m",
      breath_hold_time: "3:30 static",
      personal_best: "35m CWT",
      diving_environments: ["Tropical Reefs", "Open water"],
      // underwater performance
      performance_experience: "1-3 years",
      land_movement_sports: "Yoga, dance, swimming",
      choreography_experience: "Yes, little experience",
      filmed_underwater: "Yes, little experience",
      comfort_without_dive_line: 7,
      comfort_without_fins: 6,
      comfort_without_mask: 5,
      // equipment
      freediving_equipment: "Leaderfins, Omer mask, Cressi wetsuit",
      // creative profile
      btm_category: "Independent creator (experienced hobbyist/influencer seeking improvement)",
      online_presence: "Active social media",
      // goals
      primary_goal: "Develop underwater performance skills for creative projects",
      learning_aspects: ["Body awareness", "Techniques for expressive underwater movement"],
      learning_approach: "Mixed approach (combination of group and individual)",
      // logistics
      time_availability: "2-4 weeks", travel_willingness: "Yes, anywhere",
      budget: "$1,000 - $3,000", start_timeline: "Within 3 months",
      // open questions
      ultimate_vision: "To combine freediving with artistic expression in underwater performance",
      inspiration_to_apply: "Discovering BTM through social media and being inspired by the projects",
      referral_source: ["Social media"],
    };

    const result = schema.safeParse(answers);
    expect(result.success).toBe(true);
  });
});

describe("internship form", () => {
  it("returns a form with 6 steps", () => {
    const form = getFormDefinition("internship");
    expect(form).toBeDefined();
    expect(form!.steps).toHaveLength(6);
    expect(form!.steps.map((s) => s.id)).toEqual([
      "personal",
      "background_education",
      "filmmaking_experience",
      "motivation",
      "health_diving",
      "open_questions",
    ]);
  });

  it("buildFullSchema parses realistic answers", () => {
    const form = getFormDefinition("internship")!;
    const schema = buildFullSchema(form.steps, {});

    const answers = {
      // personal
      first_name: "Test", last_name: "User", nickname: "Tester",
      email: "test@test.com", phone: "123456", age: "18-24", gender: "Male",
      // background & education
      nationality: "German",
      country_of_residence: "Germany",
      languages: "English, German",
      current_occupation: "Student",
      education_level: "Bachelor's degree",
      field_of_study: "Marine Biology",
      recent_activities: "Studying marine biology and volunteering at a marine conservation NGO",
      // filmmaking experience
      filmmaking_experience: "Some GoPro footage while diving",
      filming_equipment: "GoPro Hero 12, basic editing laptop",
      content_created: ["Underwater videography", "Social media content"],
      // motivation
      inspiration_to_apply: "I want to combine my marine biology background with underwater filmmaking",
      ultimate_vision: "To create conservation documentaries that inspire ocean protection",
      hoped_gains: "Professional filmmaking skills and industry connections",
      why_good_candidate: "My marine biology knowledge combined with diving experience makes me a strong fit",
      // health & diving
      physical_fitness: "Good", health_conditions: "None",
      diving_types: ["Scuba diving", "Freediving"],
      certification_level: "Advanced Open Water (AOW)",
      number_of_dives: "51-100", last_dive_date: "2026-02-01",
      diving_environments: ["Reef", "Open water"],
      buoyancy_skill: 6,
      // open questions
      referral_source: ["BTM website"],
    };

    const result = schema.safeParse(answers);
    expect(result.success).toBe(true);
  });
});
