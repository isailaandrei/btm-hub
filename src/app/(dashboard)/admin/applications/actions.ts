"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  updateApplicationStatus,
  addApplicationTag,
  removeApplicationTag,
  addAdminNote,
} from "@/lib/data/applications";
import type { ApplicationStatus } from "@/types/database";
import { isValidISODate, validateUUID } from "@/lib/validation-helpers";
import { VersionConflictError } from "@/lib/optimistic-concurrency";
import { STATUSES } from "./constants";

export type ChangeStatusResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_status" | "invalid_version" | "conflict";
      message: string;
    };

export async function changeStatus(
  applicationId: string,
  status: string,
  expectedUpdatedAt: string,
): Promise<ChangeStatusResult> {
  validateUUID(applicationId);
  if (!STATUSES.includes(status as ApplicationStatus)) {
    return {
      ok: false,
      reason: "invalid_status",
      message: "Invalid application status.",
    };
  }
  if (!isValidISODate(expectedUpdatedAt)) {
    return {
      ok: false,
      reason: "invalid_version",
      message: "This application version is invalid. Refresh and try again.",
    };
  }

  try {
    const application = await updateApplicationStatus(
      applicationId,
      status as ApplicationStatus,
      {
        expectedUpdatedAt,
      },
    );

    if (application.contact_id) {
      revalidatePath(`/admin/contacts/${application.contact_id}`);
    }
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return {
        ok: false,
        reason: "conflict",
        message:
          "Another admin updated this application first. Refresh and try again.",
      };
    }
    throw error;
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function addTag(applicationId: string, tag: string) {
  validateUUID(applicationId);
  const trimmed = tag.trim().slice(0, 50);
  if (!trimmed) return;
  await addApplicationTag(applicationId, trimmed);
  revalidatePath("/admin");
}

export async function removeTag(applicationId: string, tag: string) {
  validateUUID(applicationId);
  await removeApplicationTag(applicationId, tag);
  revalidatePath("/admin");
}

export async function addNote(applicationId: string, text: string) {
  validateUUID(applicationId);
  const profile = await requireAdmin();
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  await addAdminNote(applicationId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath("/admin");
}
