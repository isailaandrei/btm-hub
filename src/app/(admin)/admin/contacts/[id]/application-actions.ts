"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getContactDetailApplication } from "@/lib/data/contact-detail";
import { validateUUID } from "@/lib/validation-helpers";

export async function loadContactApplication(applicationId: string) {
  validateUUID(applicationId, "application");
  await requireAdmin();

  const application = await getContactDetailApplication(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  return application;
}
