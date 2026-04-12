import type { FieldDefinition, FormStepDefinition } from "../types";
import { LANGUAGES } from "./options";

export const nationalityField: FieldDefinition = {
  type: "text",
  name: "nationality",
  label: "Nationality",
  required: true,
  half: true,
};

export const countryOfResidenceField: FieldDefinition = {
  type: "text",
  name: "country_of_residence",
  label: "Country of residence",
  required: true,
  half: true,
};

// Google Forms ask this as a checkboxes question with Other text.
export const languagesField: FieldDefinition = {
  type: "multiselect",
  name: "languages",
  label: "Languages",
  options: LANGUAGES,
  required: true,
  allowOther: true,
};

/**
 * Current occupation is **optional** in the filmmaking / photography /
 * freediving Google Forms but **required** in the internship Google Form.
 * Callers pass the appropriate flag for their program.
 */
export function currentOccupationField(required: boolean): FieldDefinition {
  return {
    type: "text",
    name: "current_occupation",
    label: "Current occupation",
    required,
  };
}

// Default bundle for filmmaking / photography / freediving
// (current_occupation optional per the respective Google Forms).
export const backgroundFields: FieldDefinition[] = [
  nationalityField,
  countryOfResidenceField,
  languagesField,
  currentOccupationField(false),
];

export const backgroundStep: FormStepDefinition = {
  id: "background",
  title: "Background",
  description: "Where are you from and what do you do?",
  fields: backgroundFields,
};
