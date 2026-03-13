"use server";

import { createClient } from "@/lib/supabase/server";
import { submitApplication, getApplicantName } from "@/lib/data/applications";
import { getFormDefinition } from "@/lib/academy/forms";
import { buildFullSchema } from "@/lib/academy/forms/schema-builder";
import { getProgram } from "@/lib/academy/programs";
import type { ProgramSlug } from "@/types/database";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email/send";
import { applicationConfirmationEmail } from "@/lib/email/templates/application-confirmation";
import { adminNewApplicationEmail } from "@/lib/email/templates/admin-new-application";

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? "";

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

  const formDef = getFormDefinition(programSlug);
  if (!formDef) {
    return {
      errors: null,
      message: "Validation not configured for this program.",
      success: false,
    };
  }

  // Build a lookup of field types for parsing
  const fieldTypes = new Map<string, string>();
  for (const step of formDef.steps) {
    for (const field of step.fields) {
      fieldTypes.set(field.name, field.type);
    }
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

    // Parse ratings as numbers based on field type
    if (fieldTypes.get(key) === "rating" && /^\d+$/.test(strValue)) {
      answers[key] = parseInt(strValue, 10);
      continue;
    }

    answers[key] = strValue;
  }

  // Validate using generated schema
  const schema = buildFullSchema(formDef.steps);
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

  let applicationId: string;
  try {
    const application = await submitApplication(
      programSlug as ProgramSlug,
      parsed.data as Record<string, unknown>,
      user?.id,
    );
    applicationId = application.id;
  } catch (err) {
    console.error("submitApplication error:", err);
    return {
      errors: null,
      message: "Something went wrong. Please try again.",
      success: false,
    };
  }
  

  // TODO: comment out when you set the email API KEYS
  // // Fire-and-forget email notifications
  // const applicantName = getApplicantName(answers, "Applicant");
  // const applicantEmail = answers.email as string;

  // if (applicantEmail) {
  //   const confirmation = applicationConfirmationEmail({
  //     applicantName,
  //     programName: program.name,
  //   });
  //   sendEmail({ to: applicantEmail, ...confirmation }).catch(() => {});
  // }

  // if (ADMIN_EMAIL) {
  //   const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://btmacademy.com";
  //   const adminNotification = adminNewApplicationEmail({
  //     applicantName,
  //     applicantEmail: applicantEmail ?? "",
  //     programName: program.name,
  //     applicationId,
  //     baseUrl,
  //   });
  //   sendEmail({ to: ADMIN_EMAIL, ...adminNotification }).catch(() => {});
  // }

  redirect(`/academy/${programSlug}/apply/success`);
}
