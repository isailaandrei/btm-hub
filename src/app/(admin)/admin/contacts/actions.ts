"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  updateContact,
  assignTag,
  unassignTag,
  bulkAssignTags,
  bulkUnassignTags,
  deleteApplication as deleteApplicationData,
  getContactById,
} from "@/lib/data/contacts";
import {
  excludeContactEmail,
  getActiveSuppressionForContact,
  liftContactExclusion,
} from "@/lib/data/email-suppressions";
import type { EmailSuppressionReason } from "@/types/database";
import { normalizePhoneNumber } from "@/lib/conversations/phone";
import {
  listContactConversationDigests,
  listContactConversationMessages,
  listContactCurrentConversationFacts,
  setConversationMessageDeactivated,
  upsertConversationDigestCorrection,
  type ContactConversationDigest,
  type ContactConversationMessage,
} from "@/lib/data/conversations";
import { STATUS_DIGEST_FRESHNESS_DAYS } from "@/lib/data/contact-cards";
import { getFieldEntry } from "@/lib/admin/contacts/field-registry";
import { updateProfilePreferences } from "@/lib/data/profiles";
import {
  contactsPreferencesPatchSchema,
  mergeContactsTablePreferencePatch,
} from "@/lib/admin/contacts/preferences";

const contactEmailSchema = z.email("Please enter a valid email address");

export async function editContact(
  contactId: string,
  fields: { name?: string; email?: string; phone?: string | null },
  options?: { expectedUpdatedAt?: string },
) {
  validateUUID(contactId);
  if (fields.name !== undefined) {
    fields.name = fields.name.trim();
    if (!fields.name) throw new Error("Name is required");
  }
  if (fields.email !== undefined) {
    fields.email = fields.email.trim().toLowerCase();
    if (!fields.email) throw new Error("Email is required");
    const parsed = contactEmailSchema.safeParse(fields.email);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid email address");
    }
  }
  await updateContact(contactId, fields, options);
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function assignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await assignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function unassignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await unassignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
}

// Resolve the contact's email server-side rather than trusting the client.
async function requireContactEmail(contactId: string): Promise<string> {
  validateUUID(contactId);
  const contact = await getContactById(contactId);
  if (!contact) throw new Error("Contact not found");
  return contact.email;
}

/**
 * Current do-not-email status for a contact, loaded client-side by the contact
 * detail panel's Email section (the session cache survives revalidatePath, so
 * the section fetches its own status and re-fetches after a toggle).
 */
export async function loadContactEmailSection(
  contactId: string,
): Promise<{ excluded: boolean; reason: EmailSuppressionReason | null }> {
  await requireAdmin();
  const email = await requireContactEmail(contactId);
  const suppression = await getActiveSuppressionForContact({ contactId, email });
  return { excluded: Boolean(suppression), reason: suppression?.reason ?? null };
}

/**
 * WhatsApp conversation thread for a contact, loaded client-side by the contact
 * detail panel's WhatsApp section. Includes messages linked by contact_id plus
 * any to/from the contact's phone number (e.g. received before the contact
 * existed). The section's Realtime channel keeps the open thread fresh.
 */
export async function loadContactWhatsAppMessages(
  contactId: string,
): Promise<ContactConversationMessage[]> {
  await requireAdmin();
  validateUUID(contactId);
  const contact = await getContactById(contactId);
  if (!contact) throw new Error("Contact not found");
  const phoneE164 = normalizePhoneNumber(contact.phone)?.e164 ?? null;
  return listContactConversationMessages({ contactId, phoneE164 });
}

export type ContactAiMemoryData = {
  digests: ContactConversationDigest[];
  facts: Array<{
    fieldKey: string | null;
    label: string | null;
    valueText: string;
    confidence: "high" | "medium" | "low";
    observedAt: string;
  }>;
  freshnessDays: number;
};

/**
 * What the AI holds for this contact: every digest window (signal AND noise —
 * the badges need noise rows to explain filtered exchanges) plus the current
 * structured facts, with the status-freshness horizon the card loader applies.
 * Read-only calibration surface for the WhatsApp badges (task 1) and the
 * "AI conversation memory" section (task 1b).
 */
export async function loadContactAiMemory(
  contactId: string,
): Promise<ContactAiMemoryData> {
  await requireAdmin();
  validateUUID(contactId);
  const [digests, facts] = await Promise.all([
    listContactConversationDigests(contactId),
    listContactCurrentConversationFacts(contactId),
  ]);
  return {
    digests,
    facts: facts.map((fact) => ({
      ...fact,
      label: fact.fieldKey ? (getFieldEntry(fact.fieldKey)?.label ?? null) : null,
    })),
    freshnessDays: STATUS_DIGEST_FRESHNESS_DAYS,
  };
}

const correctDigestLabelSchema = z.object({
  contactId: z.string(),
  contentHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Invalid digest content hash"),
  label: z.enum(["profile", "status", "noise"]),
  // The model's TRUE original label (from ContactConversationDigest's
  // modelRelevance/modelIsNoise) — the caller must never pass a previous
  // correction's values here, or the calibration dataset's "original" column
  // would drift away from what the model actually produced.
  originalRelevance: z.enum(["profile", "status"]).nullable(),
  originalIsNoise: z.boolean(),
});

/**
 * Admin correction of a conversation digest's label (profile / status /
 * noise) — the calibration surface the AI-visibility badges exist for
 * (task: digest-label feedback). Every read path (`contact-cards.ts`,
 * `listContactConversationDigests`, the eval live-lib mirror) overlays
 * corrections via `conversation_digests_effective`, so this takes effect for
 * the AI corpus immediately. Never mutates `conversation_digests` — the
 * model's original output stays intact as data, alongside the correction
 * pair for taxonomy-prompt tuning (see
 * `scripts/digest-correction-pairs.test.ts`).
 */
export async function correctContactDigestLabel(
  input: z.infer<typeof correctDigestLabelSchema>,
): Promise<void> {
  const profile = await requireAdmin();
  const parsed = correctDigestLabelSchema.parse(input);
  validateUUID(parsed.contactId);

  const correctedIsNoise = parsed.label === "noise";
  const correctedRelevance: "profile" | "status" | null =
    parsed.label === "noise" ? null : parsed.label;

  await upsertConversationDigestCorrection({
    contentHash: parsed.contentHash,
    correctedRelevance,
    correctedIsNoise,
    originalRelevance: parsed.originalRelevance,
    originalIsNoise: parsed.originalIsNoise,
    correctedBy: profile.id,
  });

  revalidatePath(`/admin/contacts/${parsed.contactId}`);
}

/**
 * Owner curation of a contact's WhatsApp thread: soft-deactivate an irrelevant
 * message (removes it from the active thread and the admin-AI knowledge base) or
 * restore a previously removed one. Reversible — nothing is deleted.
 */
export async function deactivateContactWhatsAppMessage(messageId: string) {
  const profile = await requireAdmin();
  validateUUID(messageId);
  await setConversationMessageDeactivated({
    messageId,
    deactivated: true,
    deactivatedBy: profile.id,
  });
}

export async function restoreContactWhatsAppMessage(messageId: string) {
  await requireAdmin();
  validateUUID(messageId);
  await setConversationMessageDeactivated({
    messageId,
    deactivated: false,
    deactivatedBy: null,
  });
}

export async function excludeContactFromEmail(contactId: string) {
  const email = await requireContactEmail(contactId);
  await excludeContactEmail({ contactId, email });
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function allowContactEmail(contactId: string) {
  const email = await requireContactEmail(contactId);
  await liftContactExclusion({ contactId, email });
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function updatePreferences(patch: Record<string, unknown>) {
  const profile = await requireAdmin();
  const parsed = contactsPreferencesPatchSchema.safeParse(patch);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid preferences";
    throw new Error(`Invalid preferences: ${message}`);
  }

  const mergedPatch = mergeContactsTablePreferencePatch(
    profile.preferences,
    parsed.data,
  );
  return updateProfilePreferences(profile.id, mergedPatch);
}

const MAX_BULK_ASSIGN = 500;

export async function bulkAssignTag(contactIds: string[], tagId: string) {
  if (contactIds.length === 0) return;
  if (contactIds.length > MAX_BULK_ASSIGN) {
    throw new Error(`Cannot assign to more than ${MAX_BULK_ASSIGN} contacts at once`);
  }
  for (const id of contactIds) validateUUID(id, "contact");
  validateUUID(tagId, "tag");
  const result = await bulkAssignTags(contactIds, tagId);
  return result;
}

export async function bulkUnassignTag(contactIds: string[], tagId: string) {
  if (contactIds.length === 0) return;
  if (contactIds.length > MAX_BULK_ASSIGN) {
    throw new Error(`Cannot unassign from more than ${MAX_BULK_ASSIGN} contacts at once`);
  }
  for (const id of contactIds) validateUUID(id, "contact");
  validateUUID(tagId, "tag");
  await bulkUnassignTags(contactIds, tagId);
}

export async function deleteApplication(applicationId: string) {
  validateUUID(applicationId, "application");
  const deletedApplication = await deleteApplicationData(applicationId);
  if (deletedApplication.contact_id) {
    revalidatePath(`/admin/contacts/${deletedApplication.contact_id}`);
  }
}
