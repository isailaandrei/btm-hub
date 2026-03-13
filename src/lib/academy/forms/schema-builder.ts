import { z } from "zod/v4";
import type { FieldDefinition, FormStepDefinition } from "./types";

// ---------------------------------------------------------------------------
// Build a Zod schema for a single field
// ---------------------------------------------------------------------------

function buildFieldSchema(field: FieldDefinition): z.ZodType {
  switch (field.type) {
    case "text": {
      if (field.storeAs === "string[]") {
        const arr = z.array(z.string());
        return field.required !== false
          ? arr.check(z.minLength(1, "Select at least one"))
          : arr;
      }

      let str: z.ZodType;
      if (field.inputType === "email") {
        str = z.email("Please enter a valid email");
      } else if (field.required !== false) {
        const min = field.minLength ?? 1;
        const msg =
          field.multiline && min > 1
            ? `Please share at least a short answer (${min}+ characters)`
            : `${field.label} is required`;
        str = z.string().min(min, msg);
      } else {
        str = z.string().optional();
      }
      return str;
    }

    case "select":
      return z.enum(field.options as [string, ...string[]]);

    case "multiselect": {
      const arr = z.array(z.enum(field.options as [string, ...string[]]));
      return field.required !== false
        ? arr.check(z.minLength(1, "Select at least one option"))
        : arr;
    }

    case "rating":
      return z.number().int().min(1).max(10);

    case "date":
      return field.required !== false
        ? z.string().min(1, `${field.label} is required`)
        : z.string().optional();
  }
}

// ---------------------------------------------------------------------------
// Build a Zod object schema for a step's fields
// ---------------------------------------------------------------------------

export function buildStepSchema(
  fields: FieldDefinition[],
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.name] = buildFieldSchema(field);
  }
  return z.object(shape);
}

// ---------------------------------------------------------------------------
// Build a full schema from all steps (flat merge)
// ---------------------------------------------------------------------------

export function buildFullSchema(
  steps: FormStepDefinition[],
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const step of steps) {
    for (const field of step.fields) {
      shape[field.name] = buildFieldSchema(field);
    }
  }
  return z.object(shape);
}
