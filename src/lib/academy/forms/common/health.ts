import type { FieldDefinition, FormStepDefinition } from "../types";

export const FITNESS_LEVELS = [
  "Low",
  "Moderate",
  "Good",
  "Excellent",
] as const;

export const HEALTH_CONDITIONS = [
  "None",
  "Minor conditions (managed)",
  "Conditions that may affect diving",
] as const;

export const healthFields: FieldDefinition[] = [
  { type: "select", name: "physical_fitness", label: "Physical Fitness Level", options: FITNESS_LEVELS, required: true },
  { type: "select", name: "health_conditions", label: "Health Conditions", options: HEALTH_CONDITIONS, required: true },
  {
    type: "text",
    multiline: true,
    name: "health_details",
    label: "Health Details (optional)",
    placeholder: "If you have any conditions, please provide details...",
    required: false,
    visibleWhen: { field: "health_conditions", operator: "neq", value: "None" },
  },
];

export const healthStep: FormStepDefinition = {
  id: "health",
  title: "Health & Fitness",
  description: "Help us understand your physical readiness for underwater activities.",
  fields: healthFields,
};
