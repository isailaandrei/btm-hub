// ---------------------------------------------------------------------------
// Field definition types (discriminated union)
// ---------------------------------------------------------------------------

interface FieldBase {
  name: string;
  label: string;
  /** Defaults to `true` when omitted — set to `false` to make the field optional. */
  required?: boolean;
  /** Render at half width (2-column grid on desktop). */
  half?: boolean;
  visibleWhen?: { field: string; operator: "eq" | "neq" | "in"; value: unknown };
}

export interface TextFieldDef extends FieldBase {
  type: "text";
  inputType?: "text" | "email" | "tel";
  placeholder?: string;
  minLength?: number;
  multiline?: boolean;
  storeAs?: "string" | "string[]";
}

export interface SelectFieldDef extends FieldBase {
  type: "select";
  options: readonly string[];
  columns?: 1 | 2 | 3;
  /**
   * When true, the field accepts any string value (not just one of `options`).
   * The renderer shows an "Other (please specify)" text input; the user's
   * custom text is stored directly in `answers[name]`, matching how Google
   * Forms stores "Other" responses in existing DB rows.
   */
  allowOther?: boolean;
}

export interface MultiSelectFieldDef extends FieldBase {
  type: "multiselect";
  options: readonly string[];
  columns?: 1 | 2 | 3;
  /**
   * When true, the stored array can contain arbitrary strings alongside the
   * canonical options. The renderer shows an extra "Other" text input whose
   * value is appended to the array on change.
   */
  allowOther?: boolean;
}

export interface RatingFieldDef extends FieldBase {
  type: "rating";
}

export interface DateFieldDef extends FieldBase {
  type: "date";
}

export type FieldDefinition =
  | TextFieldDef
  | SelectFieldDef
  | MultiSelectFieldDef
  | RatingFieldDef
  | DateFieldDef;

// ---------------------------------------------------------------------------
// Step & form definition types
// ---------------------------------------------------------------------------

export interface FormStepDefinition {
  id: string;
  title: string;
  description: string;
  fields: FieldDefinition[];
}

export interface FormDefinition {
  programSlug: string;
  steps: FormStepDefinition[];
}
