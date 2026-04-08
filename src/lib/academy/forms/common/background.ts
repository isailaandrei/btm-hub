import type { FieldDefinition, FormStepDefinition } from "../types";

export const backgroundFields: FieldDefinition[] = [
  { type: "text", name: "nationality", label: "Nationality", required: true, half: true },
  { type: "text", name: "country_of_residence", label: "Country of Residence", required: true, half: true },
  { type: "text", name: "languages", label: "Languages", required: true, half: true },
  { type: "text", name: "current_occupation", label: "Current Occupation", required: true, half: true },
];

export const backgroundStep: FormStepDefinition = {
  id: "background",
  title: "Background",
  description: "Where are you from and what do you do?",
  fields: backgroundFields,
};
