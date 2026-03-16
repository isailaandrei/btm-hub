"use client";

import { use, useState, useMemo, useEffect, useCallback, useActionState, useTransition } from "react";
import { notFound } from "next/navigation";
import { getProgram } from "@/lib/academy/programs";
import { getFormDefinition } from "@/lib/academy/forms";
import { buildStepSchema } from "@/lib/academy/forms/schema-builder";
import { FormStepper } from "@/components/forms/FormStepper";
import { DynamicFormRenderer, isFieldVisible } from "@/components/forms/DynamicFormRenderer";
import { ReviewStep } from "@/components/forms/ReviewStep";
import {
  submitAcademyApplication,
  type ApplicationFormState,
} from "./actions";

type Answers = Record<string, unknown>;

const STORAGE_PREFIX = "btm-application-";

const initialFormState: ApplicationFormState = {
  errors: null,
  message: null,
  success: false,
};

export default function ApplyPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: programSlug } = use(params);
  const program = getProgram(programSlug);

  const formDef = getFormDefinition(programSlug);

  // Version key derived from field names — changes whenever fields are added/removed/renamed
  const formVersion = formDef
    ? formDef.steps.map((s) => s.fields.map((f) => f.name).join(",")).join("|")
    : "";

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  const boundAction = useMemo(
    () => submitAcademyApplication.bind(null, programSlug),
    [programSlug],
  );
  const [formState, formAction] = useActionState(
    boundAction,
    initialFormState,
  );
  const [isPending, startTransition] = useTransition();

  // Restore from localStorage on mount (discard if form version changed)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + programSlug);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formVersion !== formVersion) {
          // Form definition changed — discard stale data
          localStorage.removeItem(STORAGE_PREFIX + programSlug);
        } else {
          if (parsed.answers) setAnswers(parsed.answers);
          if (typeof parsed.step === "number") setCurrentStep(parsed.step);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setMounted(true);
  }, [programSlug, formVersion]);

  // Save to localStorage on changes (include formVersion for staleness detection)
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        STORAGE_PREFIX + programSlug,
        JSON.stringify({ answers, step: currentStep, formVersion }),
      );
    } catch {
      // storage full or unavailable
    }
  }, [answers, currentStep, programSlug, mounted, formVersion]);

  const set = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      setStepErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  if (!program) return notFound();

  if (!program.applicationOpen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
        <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
          Applications Closed
        </h1>
        <p className="mb-8 max-w-md text-center text-muted-foreground">
          Applications for {program.name} are not currently open. Check back
          soon!
        </p>
        <a
          href="/academy"
          className="rounded-lg bg-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          Back to Academy
        </a>
      </div>
    );
  }

  if (!formDef) return notFound();

  const steps = formDef.steps;

  function validateCurrentStep(): boolean {
    const step = steps[currentStep];
    const visibleFields = step.fields.filter((f) => isFieldVisible(f, answers));
    const schema = buildStepSchema(visibleFields);

    const result = schema.safeParse(answers);
    if (result.success) {
      setStepErrors({});
      return true;
    }

    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (!errors[path]) errors[path] = issue.message;
    }
    setStepErrors(errors);
    return false;
  }

  const isReviewStep = currentStep === steps.length;

  function handleNext() {
    if (validateCurrentStep()) {
      setCurrentStep((s) => Math.min(s + 1, steps.length)); // allow stepping into review
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBack() {
    setStepErrors({});
    setCurrentStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditStep(stepIndex: number) {
    setCurrentStep(stepIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit() {
    // Build FormData from all answers
    const fd = new FormData();
    for (const [key, value] of Object.entries(answers)) {
      if (Array.isArray(value)) {
        fd.set(key, JSON.stringify(value));
      } else if (typeof value === "number") {
        fd.set(key, String(value));
      } else {
        fd.set(key, (value as string) ?? "");
      }
    }
    startTransition(() => formAction(fd));
  }

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <FormStepper
        steps={steps}
        currentStep={currentStep}
        onNext={handleNext}
        onBack={handleBack}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
      >
        {isReviewStep && formState.message && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {formState.message}
          </div>
        )}

        {isReviewStep && !formState.message && formState.errors && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Please fix the errors and try again.
          </div>
        )}

        {isReviewStep ? (
          <ReviewStep
            formDef={formDef}
            answers={answers}
            onEditStep={handleEditStep}
          />
        ) : (
          <DynamicFormRenderer
            fields={steps[currentStep].fields}
            answers={answers}
            onChange={set}
            errors={stepErrors}
          />
        )}
      </FormStepper>
    </div>
  );
}
