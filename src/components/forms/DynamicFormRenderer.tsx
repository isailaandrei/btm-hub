"use client";

import type { FieldDefinition } from "@/lib/academy/forms/types";
import { isFieldVisible } from "@/lib/academy/forms/schema-builder";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { MultiSelectField } from "./MultiSelectField";
import { RatingField } from "./RatingField";
import { DateField } from "./DateField";

export { isFieldVisible };

interface DynamicFormRendererProps {
  fields: FieldDefinition[];
  answers: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
}

function inferColumns(optionCount: number): 1 | 2 | 3 {
  if (optionCount <= 4) return 1;
  if (optionCount <= 8) return 2;
  return 3;
}

export function DynamicFormRenderer({
  fields,
  answers,
  onChange,
  errors,
}: DynamicFormRendererProps) {
  return (
    <div className="grid md:grid-cols-2 gap-x-4">
      {fields.filter((f) => isFieldVisible(f, answers)).map((field) => {
        const error = errors[field.name];
        const wrapperClass = field.half ? "py-4" : "md:col-span-2 py-4";

        return (
          <div key={field.name} className={wrapperClass}>
            {renderField(field, answers, onChange, error)}
          </div>
        );
      })}
    </div>
  );
}

function renderField(
  field: FieldDefinition,
  answers: Record<string, unknown>,
  onChange: (key: string, value: unknown) => void,
  error: string | undefined,
) {
  switch (field.type) {
    case "text": {
      if (field.storeAs === "string[]") {
        const arrValue = answers[field.name];
        const displayValue = Array.isArray(arrValue)
          ? arrValue.join(", ")
          : (arrValue as string) ?? "";
        return (
          <TextField
            label={field.label}
            name={field.name}
            required={field.required}
            placeholder={field.placeholder}
            value={displayValue}
            onChange={(v) =>
              onChange(
                field.name,
                v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            error={error}
          />
        );
      }
      return (
        <TextField
          label={field.label}
          name={field.name}
          type={field.inputType ?? "text"}
          required={field.required}
          placeholder={field.placeholder}
          multiline={field.multiline}
          value={(answers[field.name] as string) ?? ""}
          onChange={(v) => onChange(field.name, v)}
          error={error}
        />
      );
    }

    case "select":
      return (
        <SelectField
          label={field.label}
          name={field.name}
          options={field.options}
          required={field.required}
          allowOther={field.allowOther}
          value={answers[field.name] as string}
          onChange={(v) => onChange(field.name, v)}
          columns={field.columns ?? inferColumns(field.options.length)}
          error={error}
        />
      );

    case "multiselect":
      return (
        <MultiSelectField
          label={field.label}
          name={field.name}
          options={field.options}
          required={field.required}
          allowOther={field.allowOther}
          values={answers[field.name] as string[]}
          onChange={(v) => onChange(field.name, v)}
          columns={field.columns ?? inferColumns(field.options.length)}
          error={error}
        />
      );

    case "rating":
      return (
        <RatingField
          label={field.label}
          name={field.name}
          value={answers[field.name] as number}
          onChange={(v) => onChange(field.name, v)}
          error={error}
        />
      );

    case "date":
      return (
        <DateField
          label={field.label}
          name={field.name}
          required={field.required}
          value={(answers[field.name] as string) ?? ""}
          onChange={(v) => onChange(field.name, v)}
          error={error}
        />
      );
  }
}
