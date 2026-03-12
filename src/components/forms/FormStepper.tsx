"use client";

import type { StepDefinition } from "@/lib/academy/forms/photography";

interface FormStepperProps {
  steps: StepDefinition[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  children: React.ReactNode;
}

export function FormStepper({
  steps,
  currentStep,
  onNext,
  onBack,
  onSubmit,
  isSubmitting,
  children,
}: FormStepperProps) {
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Progress bar */}
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-secondary">
        <div
          className="h-full rounded-full bg-brand-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step indicator */}
      <p className="mb-8 text-sm text-brand-cyan-blue-gray">
        Step {currentStep + 1} of {steps.length} — {step.title}
      </p>

      {/* Step header */}
      <h2 className="mb-2 text-[length:var(--font-size-h2)] font-medium text-white">
        {step.title}
      </h2>
      <p className="mb-8 text-brand-cyan-blue-gray">{step.description}</p>

      {/* Step content */}
      <div className="flex flex-col gap-6">{children}</div>

      {/* Navigation */}
      <div className="mt-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isFirst}
          className="rounded-lg border border-brand-secondary px-6 py-3 text-sm font-medium text-white transition-colors hover:border-brand-light-gray disabled:pointer-events-none disabled:opacity-30"
        >
          Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-brand-primary px-8 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Submit Application"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-brand-primary px-8 py-3 font-medium text-white transition-opacity hover:opacity-90"
          >
            Next
          </button>
        )}
      </div>

      {/* Auto-save note */}
      <p className="mt-6 text-center text-xs text-brand-cyan-blue-gray">
        Your progress is automatically saved — you can close this page and come back anytime.
      </p>
    </div>
  );
}
