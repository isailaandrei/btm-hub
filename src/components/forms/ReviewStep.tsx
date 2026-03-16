"use client";

import type { FormDefinition } from "@/lib/academy/forms/types";
import { isFieldVisible } from "./DynamicFormRenderer";

interface ReviewStepProps {
  formDef: FormDefinition;
  answers: Record<string, unknown>;
  onEditStep: (stepIndex: number) => void;
}

function formatValue(value: unknown): React.ReactNode {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "number") return `${value}/10`;
  return String(value);
}

export function ReviewStep({ formDef, answers, onEditStep }: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-8">
      {formDef.steps.map((step, stepIndex) => {
        const visibleFields = step.fields.filter((f) =>
          isFieldVisible(f, answers),
        );
        if (visibleFields.length === 0) return null;

        return (
          <div key={step.id}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">{step.title}</h3>
              <button
                type="button"
                onClick={() => onEditStep(stepIndex)}
                className="text-sm text-brand-primary transition-opacity hover:opacity-80"
              >
                Edit
              </button>
            </div>
            <div className="rounded-lg border border-brand-secondary bg-brand-near-black p-4">
              <dl className="flex flex-col gap-3">
                {visibleFields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-brand-cyan-blue-gray">
                      {field.label}
                    </dt>
                    <dd className="text-sm text-white">
                      {formatValue(answers[field.name])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        );
      })}
    </div>
  );
}
