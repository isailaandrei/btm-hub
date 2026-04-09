import type { FieldDefinition, FormStepDefinition } from "../types";
import { FITNESS_LEVELS, HEALTH_CONDITIONS } from "./options";

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
    visibleWhen: { field: "health_conditions", operator: "neq", value: "No health conditions affecting diving" },
  },
];

export const healthStep: FormStepDefinition = {
  id: "health",
  title: "Health & Fitness",
  description: "Physical fitness and good health are important for safe diving and underwater filming. Please select the statement that best describes your current condition:",
  fields: healthFields,
};
