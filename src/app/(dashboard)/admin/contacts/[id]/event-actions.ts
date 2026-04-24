"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  createContactEvent,
  updateContactEvent,
  deleteContactEvent,
  resolveContactEvent,
  unresolveContactEvent,
} from "@/lib/data/contact-events";
import { syncContactMemory } from "@/lib/admin-ai-memory/server-action-sync";
import type { ContactEventType } from "@/types/database";
import { bodyRequiredFor, EVENT_TYPE_META } from "./event-types";

function scheduleNoteMemorySync(contactId: string): void {
  after(async () => {
    try {
      await syncContactMemory(contactId);
    } catch (err) {
      console.error(
        "[event-actions] post-response memory sync failed",
        { contactId, error: err instanceof Error ? err.message : String(err) },
      );
    }
  });
}

const FUTURE_SKEW_MS = 60 * 1000; // 1 minute

const eventTypeEnum = z.enum([
  "note",
  "call",
  "in_person_meeting",
  "message",
  "info_requested",
  "awaiting_btm_response",
  "custom",
]);

const createSchema = z
  .object({
    type: eventTypeEnum,
    body: z.string().max(5000, "Body must be 5000 characters or fewer"),
    customLabel: z
      .string()
      .trim()
      .max(80, "Custom label must be 80 characters or fewer")
      .nullable(),
    happenedAt: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "custom") {
      if (!data.customLabel || data.customLabel.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Custom events need a label before you can save.",
          path: ["customLabel"],
        });
      }
    }
    if (bodyRequiredFor(data.type) && data.body.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: `A "${EVENT_TYPE_META[data.type].label}" event needs a description before you can save.`,
        path: ["body"],
      });
    }
    const happenedAt = new Date(data.happenedAt).getTime();
    if (!Number.isFinite(happenedAt)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid happenedAt date",
        path: ["happenedAt"],
      });
      return;
    }
    if (happenedAt > Date.now() + FUTURE_SKEW_MS) {
      ctx.addIssue({
        code: "custom",
        message: "happenedAt cannot be in the future",
        path: ["happenedAt"],
      });
    }
  });

export type CreateEventArgs = {
  contactId: string;
  type: ContactEventType;
  body: string;
  customLabel: string | null;
  happenedAt: string;
};

export async function createEvent(args: CreateEventArgs) {
  validateUUID(args.contactId, "contact");
  const parsed = createSchema.safeParse(args);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first?.message ?? "Invalid event data");
  }
  const profile = await requireAdmin();
  const created = await createContactEvent({
    contactId: args.contactId,
    type: parsed.data.type,
    body: parsed.data.body,
    customLabel: parsed.data.type === "custom" ? parsed.data.customLabel : null,
    happenedAt: parsed.data.happenedAt,
    authorId: profile.id,
    authorName: profile.display_name ?? profile.email,
  });
  revalidatePath(`/admin/contacts/${args.contactId}`);
  revalidatePath("/admin");
  if (parsed.data.type === "note") {
    scheduleNoteMemorySync(args.contactId);
  }
  return created;
}

const updateSchema = z
  .object({
    body: z
      .string()
      .max(5000, "Body must be 5000 characters or fewer")
      .optional(),
    customLabel: z
      .string()
      .trim()
      .max(80, "Custom label must be 80 characters or fewer")
      .nullable()
      .optional(),
    happenedAt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.happenedAt !== undefined) {
      const t = new Date(data.happenedAt).getTime();
      if (!Number.isFinite(t)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid happenedAt date",
          path: ["happenedAt"],
        });
        return;
      }
      if (t > Date.now() + FUTURE_SKEW_MS) {
        ctx.addIssue({
          code: "custom",
          message: "happenedAt cannot be in the future",
          path: ["happenedAt"],
        });
      }
    }
  });

export async function updateEvent(
  eventId: string,
  fields: { body?: string; customLabel?: string | null; happenedAt?: string },
) {
  validateUUID(eventId, "event");
  const parsed = updateSchema.safeParse(fields);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first?.message ?? "Invalid event update");
  }
  const updated = await updateContactEvent(eventId, parsed.data);
  revalidatePath(`/admin/contacts/${updated.contact_id}`);
  revalidatePath("/admin");
  if (updated.type === "note") {
    scheduleNoteMemorySync(updated.contact_id);
  }
  return updated;
}

export async function deleteEvent(eventId: string) {
  validateUUID(eventId, "event");
  const deleted = await deleteContactEvent(eventId);
  revalidatePath(`/admin/contacts/${deleted.contact_id}`);
  revalidatePath("/admin");
  if (deleted.type === "note") {
    scheduleNoteMemorySync(deleted.contact_id);
  }
  return deleted;
}

export async function resolveEvent(eventId: string) {
  validateUUID(eventId, "event");
  const profile = await requireAdmin();
  const result = await resolveContactEvent(eventId, profile.id);
  revalidatePath(`/admin/contacts/${result.contact_id}`);
  revalidatePath("/admin");
  return result;
}

export async function unresolveEvent(eventId: string) {
  validateUUID(eventId, "event");
  const result = await unresolveContactEvent(eventId);
  revalidatePath(`/admin/contacts/${result.contact_id}`);
  revalidatePath("/admin");
  return result;
}
