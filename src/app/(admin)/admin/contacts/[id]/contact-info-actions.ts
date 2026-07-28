"use server";

import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import {
  createContactInfoFieldWithValue,
  getContactInfoFields,
  getContactInfoValues,
  removeContactInfoValue,
  setContactInfoValue,
} from "@/lib/data/contact-info";
import { validateUUID } from "@/lib/validation-helpers";
import type { ContactInfoField } from "@/types/database";

const contactInfoValueSchema = z
  .string()
  .trim()
  .min(1, "Value is required")
  .max(2000, "Value must be 2000 characters or fewer");

const contactInfoFieldNameSchema = z
  .string()
  .trim()
  .min(1, "Field name is required")
  .max(80, "Field name must be 80 characters or fewer");

export async function loadContactInfoSection(contactId: string) {
  validateUUID(contactId, "contact");
  await requireAdmin();
  const startedAt = startAdminTiming();

  const [fields, values] = await Promise.all([
    getContactInfoFields(),
    getContactInfoValues(contactId),
  ]);

  logAdminTiming("admin.contact.info.section.server", startedAt, {
    contactId,
    fields: fields.length,
    values: values.length,
  });

  return { fields, values };
}

// These actions back optimistic inline UI, not a useActionState form — the
// client catches a thrown error, rolls back visibly, and shows the message.
export async function setContactInfoValueAction(input: {
  contactId: string;
  fieldId: string;
  value: string;
}) {
  validateUUID(input.contactId, "contact");
  validateUUID(input.fieldId, "field");

  const parsed = contactInfoValueSchema.safeParse(input.value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid value");
  }

  await setContactInfoValue(input.contactId, input.fieldId, parsed.data);
}

export async function createContactInfoFieldAction(input: {
  contactId: string;
  name: string;
  value: string;
}): Promise<ContactInfoField> {
  validateUUID(input.contactId, "contact");

  const name = contactInfoFieldNameSchema.safeParse(input.name);
  if (!name.success) {
    throw new Error(name.error.issues[0]?.message ?? "Invalid field name");
  }
  const value = contactInfoValueSchema.safeParse(input.value);
  if (!value.success) {
    throw new Error(value.error.issues[0]?.message ?? "Invalid value");
  }

  return createContactInfoFieldWithValue(input.contactId, name.data, value.data);
}

export async function removeContactInfoValueAction(input: {
  contactId: string;
  fieldId: string;
}) {
  validateUUID(input.contactId, "contact");
  validateUUID(input.fieldId, "field");

  await removeContactInfoValue(input.contactId, input.fieldId);
}
