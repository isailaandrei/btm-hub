"use client";

import type { FieldDefinition } from "@/lib/academy/forms/types";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { MultiSelectField } from "./MultiSelectField";
import { RatingField } from "./RatingField";
import { DateField } from "./DateField";

interface DynamicFormRendererProps {
  fields: FieldDefinition[];
  answers: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
}

export function isFieldVisible(
  field: FieldDefinition,
  answers: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true;
  const { field: depField, operator, value } = field.visibleWhen;
  const actual = answers[depField];
  switch (operator) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "in":
      return Array.isArray(value) && value.includes(actual);
  }
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
    <>
      {fields.filter((f) => isFieldVisible(f, answers)).map((field) => {
        const error = errors[field.name];

        switch (field.type) {
          case "text": {
            if (field.storeAs === "string[]") {
              const arrValue = answers[field.name];
              const displayValue = Array.isArray(arrValue)
                ? arrValue.join(", ")
                : (arrValue as string) ?? "";
              return (
                <TextField
                  key={field.name}
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
                key={field.name}
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
                key={field.name}
                label={field.label}
                name={field.name}
                options={field.options}
                required={field.required}
                value={answers[field.name] as string}
                onChange={(v) => onChange(field.name, v)}
                columns={inferColumns(field.options.length)}
                error={error}
              />
            );

          case "multiselect":
            return (
              <MultiSelectField
                key={field.name}
                label={field.label}
                name={field.name}
                options={field.options}
                required={field.required}
                values={answers[field.name] as string[]}
                onChange={(v) => onChange(field.name, v)}
                columns={inferColumns(field.options.length)}
                error={error}
              />
            );

          case "rating":
            return (
              <RatingField
                key={field.name}
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
                key={field.name}
                label={field.label}
                name={field.name}
                required={field.required}
                value={(answers[field.name] as string) ?? ""}
                onChange={(v) => onChange(field.name, v)}
                error={error}
              />
            );

        }
      })}
    </>
  );
}
