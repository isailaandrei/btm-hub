import type { FieldDefinition, FormStepDefinition } from "../types";
import { AGE_RANGES, GENDERS } from "./options";
import { backgroundFields } from "./background";

// Individual field exports so program-specific forms (e.g., internship)
// can compose a personal step with overrides — notably the age field,
// which is a numeric short-answer on the internship Google Form but a
// range select on the other 3 programs.

export const firstNameField: FieldDefinition = {
  type: "text",
  name: "first_name",
  label: "First Name",
  required: true,
  half: true,
};

export const lastNameField: FieldDefinition = {
  type: "text",
  name: "last_name",
  label: "Last Name",
  required: true,
  half: true,
};

// Optional on every Google Form.
export const nicknameField: FieldDefinition = {
  type: "text",
  name: "nickname",
  label: "Nickname",
  required: false,
  half: true,
};

export const emailField: FieldDefinition = {
  type: "text",
  name: "email",
  label: "Email",
  inputType: "email",
  required: true,
  half: true,
};

export const phoneField: FieldDefinition = {
  type: "text",
  name: "phone",
  label: "Phone Number",
  inputType: "tel",
  required: true,
};

// Used by filmmaking, photography, freediving (Google Form = range select).
export const ageRangeField: FieldDefinition = {
  type: "select",
  name: "age",
  label: "Age Range",
  options: AGE_RANGES,
  required: true,
};

// Used by internship only (Google Form = short-answer numeric).
export const ageTextField: FieldDefinition = {
  type: "text",
  name: "age",
  label: "Age",
  required: true,
  half: true,
};

export const genderField: FieldDefinition = {
  type: "select",
  name: "gender",
  label: "Gender",
  options: GENDERS,
  required: true,
};

// Default personal fields for filmmaking / photography / freediving.
// (Internship composes its own version with ageTextField.)
export const personalFields: FieldDefinition[] = [
  firstNameField,
  lastNameField,
  nicknameField,
  emailField,
  phoneField,
  ageRangeField,
  genderField,
];

export const personalStep: FormStepDefinition = {
  id: "personal",
  title: "About You",
  description:
    "Help us get to know you better. This information will be kept confidential and used only for BTM Academy purposes.",
  fields: [...personalFields, ...backgroundFields],
};
