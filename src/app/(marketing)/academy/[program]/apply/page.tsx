"use client";

import { use, useState, useEffect, useCallback, useActionState, useTransition } from "react";
import { notFound } from "next/navigation";
import { getProgram } from "@/lib/academy/programs";
import {
  PHOTOGRAPHY_STEPS,
  photographyStepSchemas,
  AGE_RANGES,
  GENDERS,
  FITNESS_LEVELS,
  HEALTH_CONDITIONS,
  DIVING_TYPES,
  CERTIFICATION_LEVELS,
  NUMBER_OF_DIVES,
  DIVING_ENVIRONMENTS,
  EQUIPMENT_OWNED,
  PLANNING_TO_INVEST,
  YEARS_EXPERIENCE,
  CONTENT_CREATED,
  BTM_CATEGORIES,
  INVOLVEMENT_LEVELS,
  ONLINE_PRESENCE,
  INCOME_FROM_PHOTOGRAPHY,
  PRIMARY_GOALS,
  LEARNING_ASPECTS,
  CONTENT_TO_CREATE,
  LEARNING_APPROACHES,
  MARINE_SUBJECTS,
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  REFERRAL_SOURCES,
} from "@/lib/academy/forms/photography";
import { FormStepper } from "@/components/forms/FormStepper";
import { TextField } from "@/components/forms/TextField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { SelectField } from "@/components/forms/SelectField";
import { MultiSelectField } from "@/components/forms/MultiSelectField";
import { RatingField } from "@/components/forms/RatingField";
import { DateField } from "@/components/forms/DateField";
import {
  submitAcademyApplication,
  type ApplicationFormState,
} from "./actions";

type Answers = Record<string, unknown>;

const STORAGE_PREFIX = "btm-application-";

const initialFormState: ApplicationFormState = {
  errors: null,
  message: null,
  success: false,
};

export default function ApplyPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: programSlug } = use(params);
  const program = getProgram(programSlug);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  const boundAction = submitAcademyApplication.bind(null, programSlug);
  const [formState, formAction] = useActionState(
    boundAction,
    initialFormState,
  );
  const [isPending, startTransition] = useTransition();

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + programSlug);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.answers) setAnswers(parsed.answers);
        if (typeof parsed.step === "number") setCurrentStep(parsed.step);
      }
    } catch {
      // ignore corrupt storage
    }
    setMounted(true);
  }, [programSlug]);

  // Save to localStorage on changes
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        STORAGE_PREFIX + programSlug,
        JSON.stringify({ answers, step: currentStep }),
      );
    } catch {
      // storage full or unavailable
    }
  }, [answers, currentStep, programSlug, mounted]);

  const set = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      setStepErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const val = useCallback(
    (key: string): unknown => answers[key],
    [answers],
  );

  if (!program) return notFound();

  if (!program.applicationOpen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-5 py-20">
        <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-white">
          Applications Closed
        </h1>
        <p className="mb-8 max-w-md text-center text-brand-cyan-blue-gray">
          Applications for {program.name} are not currently open. Check back
          soon!
        </p>
        <a
          href="/academy"
          className="rounded-lg bg-brand-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          Back to Academy
        </a>
      </div>
    );
  }

  const steps = PHOTOGRAPHY_STEPS;

  function validateCurrentStep(): boolean {
    const stepId = steps[currentStep].id;
    const schema = photographyStepSchemas[stepId];
    if (!schema) return true;

    // Collect only the fields relevant to this step
    const result = schema.safeParse(answers);
    if (result.success) {
      setStepErrors({});
      return true;
    }

    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (!errors[path]) errors[path] = issue.message;
    }
    setStepErrors(errors);
    return false;
  }

  function handleNext() {
    if (validateCurrentStep()) {
      setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBack() {
    setStepErrors({});
    setCurrentStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit() {
    if (!validateCurrentStep()) return;

    // Build FormData from all answers
    const fd = new FormData();
    for (const [key, value] of Object.entries(answers)) {
      if (Array.isArray(value)) {
        fd.set(key, JSON.stringify(value));
      } else if (typeof value === "number") {
        fd.set(key, String(value));
      } else {
        fd.set(key, (value as string) ?? "");
      }
    }
    startTransition(() => formAction(fd));
  }

  // Merge server-side errors with step errors for display
  const allErrors = { ...stepErrors };
  if (formState.errors) {
    for (const [key, messages] of Object.entries(formState.errors)) {
      if (!allErrors[key]) allErrors[key] = messages[0];
    }
  }

  const err = (key: string) => allErrors[key];

  return (
    <div className="min-h-screen bg-brand-background px-5 py-20">
      {formState.message && !formState.success && (
        <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {formState.message}
        </div>
      )}

      <FormStepper
        steps={steps}
        currentStep={currentStep}
        onNext={handleNext}
        onBack={handleBack}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
      >
        {/* Step 1 — Personal */}
        {currentStep === 0 && (
          <>
            <TextField
              label="First Name"
              name="first_name"
              required
              value={(val("first_name") as string) ?? ""}
              onChange={(v) => set("first_name", v)}
              error={err("first_name")}
            />
            <TextField
              label="Last Name"
              name="last_name"
              required
              value={(val("last_name") as string) ?? ""}
              onChange={(v) => set("last_name", v)}
              error={err("last_name")}
            />
            <TextField
              label="Nickname"
              name="nickname"
              required
              value={(val("nickname") as string) ?? ""}
              onChange={(v) => set("nickname", v)}
              error={err("nickname")}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              required
              value={(val("email") as string) ?? ""}
              onChange={(v) => set("email", v)}
              error={err("email")}
            />
            <TextField
              label="Phone Number"
              name="phone"
              type="tel"
              required
              value={(val("phone") as string) ?? ""}
              onChange={(v) => set("phone", v)}
              error={err("phone")}
            />
            <SelectField
              label="Age Range"
              name="age"
              options={AGE_RANGES}
              required
              value={val("age") as string}
              onChange={(v) => set("age", v)}
              error={err("age")}
              columns={3}
            />
            <SelectField
              label="Gender"
              name="gender"
              options={GENDERS}
              required
              value={val("gender") as string}
              onChange={(v) => set("gender", v)}
              error={err("gender")}
              columns={2}
            />
          </>
        )}

        {/* Step 2 — Background */}
        {currentStep === 1 && (
          <>
            <TextField
              label="Nationality"
              name="nationality"
              required
              value={(val("nationality") as string) ?? ""}
              onChange={(v) => set("nationality", v)}
              error={err("nationality")}
            />
            <TextField
              label="Country of Residence"
              name="country_of_residence"
              required
              value={(val("country_of_residence") as string) ?? ""}
              onChange={(v) => set("country_of_residence", v)}
              error={err("country_of_residence")}
            />
            <TextField
              label="Languages (comma-separated)"
              name="languages"
              required
              placeholder="English, Spanish, French"
              value={
                Array.isArray(val("languages"))
                  ? (val("languages") as string[]).join(", ")
                  : (val("languages") as string) ?? ""
              }
              onChange={(v) =>
                set(
                  "languages",
                  v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              error={err("languages")}
            />
            <TextField
              label="Current Occupation"
              name="current_occupation"
              required
              value={(val("current_occupation") as string) ?? ""}
              onChange={(v) => set("current_occupation", v)}
              error={err("current_occupation")}
            />
          </>
        )}

        {/* Step 3 — Health */}
        {currentStep === 2 && (
          <>
            <SelectField
              label="Physical Fitness Level"
              name="physical_fitness"
              options={FITNESS_LEVELS}
              required
              value={val("physical_fitness") as string}
              onChange={(v) => set("physical_fitness", v)}
              error={err("physical_fitness")}
              columns={2}
            />
            <SelectField
              label="Health Conditions"
              name="health_conditions"
              options={HEALTH_CONDITIONS}
              required
              value={val("health_conditions") as string}
              onChange={(v) => set("health_conditions", v)}
              error={err("health_conditions")}
            />
            <TextAreaField
              label="Health Details (optional)"
              name="health_details"
              placeholder="If you have any conditions, please provide details..."
              value={(val("health_details") as string) ?? ""}
              onChange={(v) => set("health_details", v)}
              error={err("health_details")}
            />
          </>
        )}

        {/* Step 4 — Diving */}
        {currentStep === 3 && (
          <>
            <MultiSelectField
              label="Types of Diving"
              name="diving_types"
              options={DIVING_TYPES}
              required
              values={val("diving_types") as string[]}
              onChange={(v) => set("diving_types", v)}
              error={err("diving_types")}
            />
            <SelectField
              label="Certification Level"
              name="certification_level"
              options={CERTIFICATION_LEVELS}
              required
              value={val("certification_level") as string}
              onChange={(v) => set("certification_level", v)}
              error={err("certification_level")}
            />
            <TextField
              label="Certification Details (optional)"
              name="certification_details"
              placeholder="Agency, cert number, etc."
              value={(val("certification_details") as string) ?? ""}
              onChange={(v) => set("certification_details", v)}
              error={err("certification_details")}
            />
            <SelectField
              label="Number of Dives"
              name="number_of_dives"
              options={NUMBER_OF_DIVES}
              required
              value={val("number_of_dives") as string}
              onChange={(v) => set("number_of_dives", v)}
              error={err("number_of_dives")}
              columns={3}
            />
            <DateField
              label="Last Dive Date"
              name="last_dive_date"
              required
              value={(val("last_dive_date") as string) ?? ""}
              onChange={(v) => set("last_dive_date", v)}
              error={err("last_dive_date")}
            />
            <MultiSelectField
              label="Diving Environments"
              name="diving_environments"
              options={DIVING_ENVIRONMENTS}
              required
              values={val("diving_environments") as string[]}
              onChange={(v) => set("diving_environments", v)}
              error={err("diving_environments")}
            />
            <RatingField
              label="Buoyancy Skill (1 = beginner, 10 = expert)"
              name="buoyancy_skill"
              value={val("buoyancy_skill") as number}
              onChange={(v) => set("buoyancy_skill", v)}
              error={err("buoyancy_skill")}
            />
          </>
        )}

        {/* Step 5 — Equipment */}
        {currentStep === 4 && (
          <>
            <MultiSelectField
              label="Equipment Owned"
              name="equipment_owned"
              options={EQUIPMENT_OWNED}
              values={val("equipment_owned") as string[]}
              onChange={(v) => set("equipment_owned", v)}
              error={err("equipment_owned")}
            />
            <TextAreaField
              label="Describe Your Photography Equipment"
              name="photography_equipment"
              required
              placeholder="Camera body, lenses, housing, lights, editing software..."
              value={(val("photography_equipment") as string) ?? ""}
              onChange={(v) => set("photography_equipment", v)}
              error={err("photography_equipment")}
            />
            <SelectField
              label="Planning to Invest in New Equipment?"
              name="planning_to_invest"
              options={PLANNING_TO_INVEST}
              required
              value={val("planning_to_invest") as string}
              onChange={(v) => set("planning_to_invest", v)}
              error={err("planning_to_invest")}
            />
          </>
        )}

        {/* Step 6 — Skills */}
        {currentStep === 5 && (
          <>
            <SelectField
              label="Years of Photography Experience"
              name="years_experience"
              options={YEARS_EXPERIENCE}
              required
              value={val("years_experience") as string}
              onChange={(v) => set("years_experience", v)}
              error={err("years_experience")}
              columns={3}
            />
            <RatingField
              label="Camera Settings & Exposure"
              name="skill_camera_settings"
              value={val("skill_camera_settings") as number}
              onChange={(v) => set("skill_camera_settings", v)}
              error={err("skill_camera_settings")}
            />
            <RatingField
              label="Lighting"
              name="skill_lighting"
              value={val("skill_lighting") as number}
              onChange={(v) => set("skill_lighting", v)}
              error={err("skill_lighting")}
            />
            <RatingField
              label="Post-Production"
              name="skill_post_production"
              value={val("skill_post_production") as number}
              onChange={(v) => set("skill_post_production", v)}
              error={err("skill_post_production")}
            />
            <RatingField
              label="Color Correction"
              name="skill_color_correction"
              value={val("skill_color_correction") as number}
              onChange={(v) => set("skill_color_correction", v)}
              error={err("skill_color_correction")}
            />
            <RatingField
              label="Composition"
              name="skill_composition"
              value={val("skill_composition") as number}
              onChange={(v) => set("skill_composition", v)}
              error={err("skill_composition")}
            />
            <RatingField
              label="Drone Operation"
              name="skill_drone"
              value={val("skill_drone") as number}
              onChange={(v) => set("skill_drone", v)}
              error={err("skill_drone")}
            />
            <RatingField
              label="Over-Water Photography"
              name="skill_over_water"
              value={val("skill_over_water") as number}
              onChange={(v) => set("skill_over_water", v)}
              error={err("skill_over_water")}
            />
          </>
        )}

        {/* Step 7 — Creative Profile */}
        {currentStep === 6 && (
          <>
            <MultiSelectField
              label="Content You've Created"
              name="content_created"
              options={CONTENT_CREATED}
              required
              values={val("content_created") as string[]}
              onChange={(v) => set("content_created", v)}
              error={err("content_created")}
            />
            <SelectField
              label="How Would You Categorize Yourself?"
              name="btm_category"
              options={BTM_CATEGORIES}
              required
              value={val("btm_category") as string}
              onChange={(v) => set("btm_category", v)}
              error={err("btm_category")}
              columns={2}
            />
            <SelectField
              label="Level of Involvement in Photography"
              name="involvement_level"
              options={INVOLVEMENT_LEVELS}
              required
              value={val("involvement_level") as string}
              onChange={(v) => set("involvement_level", v)}
              error={err("involvement_level")}
              columns={2}
            />
            <SelectField
              label="Online Presence"
              name="online_presence"
              options={ONLINE_PRESENCE}
              required
              value={val("online_presence") as string}
              onChange={(v) => set("online_presence", v)}
              error={err("online_presence")}
            />
            <TextField
              label="Links to Your Work (optional)"
              name="online_links"
              placeholder="Instagram, website, portfolio..."
              value={(val("online_links") as string) ?? ""}
              onChange={(v) => set("online_links", v)}
              error={err("online_links")}
            />
            <SelectField
              label="Income from Photography"
              name="income_from_photography"
              options={INCOME_FROM_PHOTOGRAPHY}
              required
              value={val("income_from_photography") as string}
              onChange={(v) => set("income_from_photography", v)}
              error={err("income_from_photography")}
            />
          </>
        )}

        {/* Step 8 — Goals */}
        {currentStep === 7 && (
          <>
            <SelectField
              label="Primary Goal"
              name="primary_goal"
              options={PRIMARY_GOALS}
              required
              value={val("primary_goal") as string}
              onChange={(v) => set("primary_goal", v)}
              error={err("primary_goal")}
            />
            <TextField
              label="Secondary Goal (optional)"
              name="secondary_goal"
              placeholder="Any other goals you'd like to achieve?"
              value={(val("secondary_goal") as string) ?? ""}
              onChange={(v) => set("secondary_goal", v)}
              error={err("secondary_goal")}
            />
            <MultiSelectField
              label="Aspects You Want to Learn"
              name="learning_aspects"
              options={LEARNING_ASPECTS}
              required
              values={val("learning_aspects") as string[]}
              onChange={(v) => set("learning_aspects", v)}
              error={err("learning_aspects")}
            />
            <MultiSelectField
              label="Content You Want to Create"
              name="content_to_create"
              options={CONTENT_TO_CREATE}
              required
              values={val("content_to_create") as string[]}
              onChange={(v) => set("content_to_create", v)}
              error={err("content_to_create")}
            />
            <MultiSelectField
              label="Preferred Learning Approach"
              name="learning_approach"
              options={LEARNING_APPROACHES}
              required
              values={val("learning_approach") as string[]}
              onChange={(v) => set("learning_approach", v)}
              error={err("learning_approach")}
            />
            <MultiSelectField
              label="Marine Subjects of Interest"
              name="marine_subjects"
              options={MARINE_SUBJECTS}
              required
              values={val("marine_subjects") as string[]}
              onChange={(v) => set("marine_subjects", v)}
              error={err("marine_subjects")}
            />
          </>
        )}

        {/* Step 9 — Logistics */}
        {currentStep === 8 && (
          <>
            <SelectField
              label="Time Availability"
              name="time_availability"
              options={TIME_AVAILABILITY}
              required
              value={val("time_availability") as string}
              onChange={(v) => set("time_availability", v)}
              error={err("time_availability")}
              columns={3}
            />
            <SelectField
              label="Willingness to Travel"
              name="travel_willingness"
              options={TRAVEL_WILLINGNESS}
              required
              value={val("travel_willingness") as string}
              onChange={(v) => set("travel_willingness", v)}
              error={err("travel_willingness")}
              columns={2}
            />
            <SelectField
              label="Budget"
              name="budget"
              options={BUDGETS}
              required
              value={val("budget") as string}
              onChange={(v) => set("budget", v)}
              error={err("budget")}
              columns={3}
            />
            <SelectField
              label="When Can You Start?"
              name="start_timeline"
              options={START_TIMELINES}
              required
              value={val("start_timeline") as string}
              onChange={(v) => set("start_timeline", v)}
              error={err("start_timeline")}
              columns={3}
            />
          </>
        )}

        {/* Step 10 — Open Questions */}
        {currentStep === 9 && (
          <>
            <TextAreaField
              label="What is your ultimate vision for your underwater photography career or journey?"
              name="ultimate_vision"
              required
              value={(val("ultimate_vision") as string) ?? ""}
              onChange={(v) => set("ultimate_vision", v)}
              error={err("ultimate_vision")}
            />
            <TextAreaField
              label="What inspired you to apply to the BTM Academy?"
              name="inspiration_to_apply"
              required
              value={(val("inspiration_to_apply") as string) ?? ""}
              onChange={(v) => set("inspiration_to_apply", v)}
              error={err("inspiration_to_apply")}
            />
            <MultiSelectField
              label="How Did You Hear About Us?"
              name="referral_source"
              options={REFERRAL_SOURCES}
              required
              values={val("referral_source") as string[]}
              onChange={(v) => set("referral_source", v)}
              error={err("referral_source")}
            />
            <TextAreaField
              label="Questions or Concerns (optional)"
              name="questions_or_concerns"
              placeholder="Anything you'd like to ask or flag before submitting?"
              value={(val("questions_or_concerns") as string) ?? ""}
              onChange={(v) => set("questions_or_concerns", v)}
              error={err("questions_or_concerns")}
            />
            <TextAreaField
              label="Anything Else? (optional)"
              name="anything_else"
              placeholder="Share anything else you'd like us to know..."
              value={(val("anything_else") as string) ?? ""}
              onChange={(v) => set("anything_else", v)}
              error={err("anything_else")}
            />
          </>
        )}
      </FormStepper>
    </div>
  );
}
