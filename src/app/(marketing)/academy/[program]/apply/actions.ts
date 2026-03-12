"use server";

import { createClient } from "@/lib/supabase/server";
import { submitApplication } from "@/lib/data/applications";
import { photographyAnswersSchema } from "@/lib/academy/forms/photography";
import { getProgram } from "@/lib/academy/programs";
import type { ProgramSlug } from "@/types/database";
import { redirect } from "next/navigation";

export type ApplicationFormState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
};

export async function submitAcademyApplication(
  programSlug: string,
  prevState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const program = getProgram(programSlug);
  if (!program) {
    return { errors: null, message: "Invalid program.", success: false };
  }

  if (!program.applicationOpen) {
    return {
      errors: null,
      message: "Applications are currently closed for this program.",
      success: false,
    };
  }

  // Parse form data — multi-selects are JSON-encoded, ratings are numeric
  const raw = Object.fromEntries(formData.entries());
  const answers: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue;

    const strValue = value as string;

    // Try parsing as JSON (multi-select arrays)
    if (strValue.startsWith("[")) {
      try {
        answers[key] = JSON.parse(strValue);
        continue;
      } catch {
        // not JSON, treat as string
      }
    }

    // Parse ratings as numbers
    if (
      (key.startsWith("skill_") || key === "buoyancy_skill") &&
      /^\d+$/.test(strValue)
    ) {
      answers[key] = parseInt(strValue, 10);
      continue;
    }

    answers[key] = strValue;
  }

  // Validate based on program
  let schema;
  if (programSlug === "photography") {
    schema = photographyAnswersSchema;
  } else {
    return {
      errors: null,
      message: "Validation not configured for this program.",
      success: false,
    };
  }

  const parsed = schema.safeParse(answers);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return {
      errors: fieldErrors,
      message: "Please fix the errors below.",
      success: false,
    };
  }

  // Get current user (optional — guest applications are allowed)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    await submitApplication(
      programSlug as ProgramSlug,
      parsed.data as Record<string, unknown>,
      user?.id,
    );
  } catch (err) {
    console.error("submitApplication error:", err);
    return {
      errors: null,
      message: "Something went wrong. Please try again.",
      success: false,
    };
  }

  redirect(`/academy/${programSlug}/apply/success`);
}
