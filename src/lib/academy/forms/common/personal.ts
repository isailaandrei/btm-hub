import type { FieldDefinition, FormStepDefinition } from "../types";

export const AGE_RANGES = [
  "Under 18",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;

export const GENDERS = [
  "Male",
  "Female",
  "Non-binary",
  "Prefer not to say",
] as const;

export const personalFields: FieldDefinition[] = [
  { type: "text", name: "first_name", label: "First Name", required: true },
  { type: "text", name: "last_name", label: "Last Name", required: true },
  { type: "text", name: "nickname", label: "Nickname", required: true },
  { type: "text", name: "email", label: "Email", inputType: "email", required: true },
  { type: "text", name: "phone", label: "Phone Number", inputType: "tel", required: true },
  { type: "select", name: "age", label: "Age Range", options: AGE_RANGES, required: true },
  { type: "select", name: "gender", label: "Gender", options: GENDERS, required: true },
];

export const personalStep: FormStepDefinition = {
  id: "personal",
  title: "Personal Information",
  description: "Tell us a bit about yourself so we can get to know you.",
  fields: personalFields,
};
