import type { FieldDefinition, FormStepDefinition } from "../types";

export const FITNESS_LEVELS = [
  "Excellent - Regular exercise, no health concerns",
  "Good - Moderately active, no major health concerns",
  "Average - Some physical activity, manageable health conditions",
  "Need improvement - Limited physical activity or health concerns",
  "Prefer to discuss privately"
] as const;

export const HEALTH_CONDITIONS = [
  "No health conditions affecting diving",
  "Yes, but cleared by doctor for diving",
  "Need medical clearance",
  "Prefer to discuss privately"
] as const;

export const healthFields: FieldDefinition[] = [
  { type: "select", name: "physical_fitness", label: "Physical Fitness Level", options: FITNESS_LEVELS, required: true, columns: 1 },
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
  description: "Physical fitness and good health are important for safe diving and underwater filming. Please select the statement that best describes your current condition:",
  fields: healthFields,
};
