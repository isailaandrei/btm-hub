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
  getDigestModelState,
  listContactConversationDigests,
  listContactConversationMessages,
  listContactCurrentConversationFacts,
  setConversationMessageDeactivated,
  upsertConversationDigestCorrection,
  type ContactConversationDigest,
  type ContactConversationMessage,
  type DigestModelState,
} from "@/lib/data/conversations";
import {
  STATUS_DIGEST_FRESHNESS_DAYS,
  STATUS_EVENT_GRACE_DAYS,
} from "@/lib/data/contact-cards";
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
  /** STATUS_EVENT_GRACE_DAYS — passed alongside freshnessDays so the client's
   * pure expiry math has both constants without importing server modules. */
  eventGraceDays: number;
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
    eventGraceDays: STATUS_EVENT_GRACE_DAYS,
  };
}

const DIGEST_EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const correctDigestSchema = z
  .object({
    contactId: z.string(),
    contentHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "Invalid digest content hash"),
    // null = NO label correction — the effective label is inherited from the
    // model (this correction carries only a summary/event-date/dismissal). A
    // non-null label records a correction PAIR (with the model's originals).
    label: z.enum(["profile", "status", "noise"]).nullable(),
    // Human-authored summary override (noise rescue), trimmed; empty coerces to
    // null (no summary correction) so the model's summary stands.
    correctedSummary: z
      .string()
      .trim()
      .max(2000, "Summary is too long (max 2000 characters)")
      .nullable()
      .transform((value) => (value && value.length > 0 ? value : null)),
    // Human-corrected event date — strict YYYY-MM-DD that is a real calendar day.
    correctedEventDate: z
      .string()
      .regex(DIGEST_EVENT_DATE_PATTERN, "Event date must be YYYY-MM-DD")
      .refine((value) => {
        const ms = Date.parse(`${value}T00:00:00.000Z`);
        return (
          Number.isFinite(ms) &&
          new Date(ms).toISOString().slice(0, 10) === value
        );
      }, "Event date must be a real calendar date")
      .nullable(),
    // The model's TRUE original label (from ContactConversationDigest's
    // modelRelevance/modelIsNoise) — the caller must never pass a previous
    // correction's values here, or the calibration dataset's "original" column
    // would drift away from what the model actually produced. Both null on a
    // label-less correction (no original to record).
    originalRelevance: z.enum(["profile", "status"]).nullable(),
    originalIsNoise: z.boolean().nullable(),
    // Remove this digest from AI memory now (revertible). Only valid on a
    // status digest — enforced against the effective label below.
    dismissed: z.boolean(),
  })
  // The label pair is all-or-nothing: a label correction must carry the model's
  // original label; a label-less correction must not (it would fabricate an
  // identity pair and pollute the calibration dataset).
  .refine(
    (value) =>
      value.label === null
        ? value.originalIsNoise === null && value.originalRelevance === null
        : value.originalIsNoise !== null,
    {
      message:
        "A label correction must carry the model's original label; a label-less correction must not.",
    },
  );

export type CorrectContactDigestInput = z.input<typeof correctDigestSchema>;

/**
 * Admin correction of a conversation digest — an OPTIONAL label (profile /
 * status / noise), a human-authored summary (the noise-rescue path), the event
 * date, and a dismissal (remove a status digest from AI memory now) — the
 * calibration surface the AI-visibility badges exist for. The caller sends the
 * COMPLETE desired correction state every time (a full-row upsert on
 * content_hash), so a label-only edit must merge existing summary/event-date
 * values in rather than wiping them, and a summary/date/dismissal edit must not
 * clear an existing label correction (or vice versa). `label === null` records
 * NO label pair — the effective label inherits the model's, which keeps
 * identity pairs out of the calibration dataset. Every read path
 * (`contact-cards.ts`, `listContactConversationDigests`, the eval live-lib
 * mirror) overlays corrections via `conversation_digests_effective`, so this
 * takes effect for the AI corpus immediately. Never mutates
 * `conversation_digests` — the model's original output stays intact as data,
 * alongside the correction pair for taxonomy-prompt tuning (see
 * `scripts/digest-correction-pairs.test.ts`).
 */
export async function correctContactDigest(
  input: CorrectContactDigestInput,
): Promise<void> {
  const profile = await requireAdmin();
  const parsed = correctDigestSchema.parse(input);
  validateUUID(parsed.contactId);

  const hasLabelCorrection = parsed.label !== null;
  const correctedIsNoise: boolean | null = hasLabelCorrection
    ? parsed.label === "noise"
    : null;
  const correctedRelevance: "profile" | "status" | null =
    parsed.label === "profile" || parsed.label === "status" ? parsed.label : null;

  // The model's state is needed only when we can't derive the effective label
  // from the sent label (label-less correction) or when the summary guard fires
  // — fetch it at most once.
  let modelState: DigestModelState | null | undefined;
  const loadModelState = async (): Promise<DigestModelState> => {
    if (modelState === undefined) {
      modelState = await getDigestModelState(parsed.contentHash);
    }
    if (!modelState) {
      // No digest row for this hash (mid-recalibration): nothing to overlay.
      throw new Error(
        "This exchange is being re-processed — try the correction again in a moment.",
      );
    }
    return modelState;
  };

  // The EFFECTIVE label after this correction: a sent label wins; a label-less
  // correction inherits the model's label.
  let effectiveLabel: "profile" | "status" | "noise";
  if (hasLabelCorrection) {
    effectiveLabel = parsed.label as "profile" | "status" | "noise";
  } else {
    const state = await loadModelState();
    effectiveLabel = state.isNoise
      ? "noise"
      : state.relevance === "profile"
        ? "profile"
        : "status";
  }

  // Fail loud: a dismissal removes a digest from AI memory ahead of its natural
  // expiry — only meaningful for a STATUS digest. Profile is permanent; noise is
  // already hidden. Rejected against the effective (possibly inherited) label.
  if (parsed.dismissed && effectiveLabel !== "status") {
    throw new Error("Only a status digest can be removed from AI memory.");
  }

  // Fail loud: a signal (profile/status) effective label must not leave the
  // effective summary empty. The resulting effective summary is the
  // correctedSummary when present, else the model's original — so rescuing a
  // noise-marker window (empty model summary) REQUIRES a human-authored summary.
  if (effectiveLabel !== "noise" && parsed.correctedSummary === null) {
    const state = await loadModelState();
    if (state.summary.trim() === "") {
      throw new Error(
        "A profile or status label needs a summary — add one to rescue this exchange.",
      );
    }
  }

  await upsertConversationDigestCorrection({
    contentHash: parsed.contentHash,
    correctedRelevance,
    correctedIsNoise,
    correctedSummary: parsed.correctedSummary,
    correctedEventDate: parsed.correctedEventDate,
    originalRelevance: hasLabelCorrection ? parsed.originalRelevance : null,
    originalIsNoise: hasLabelCorrection ? parsed.originalIsNoise : null,
    dismissedAt: parsed.dismissed ? new Date().toISOString() : null,
    dismissedBy: parsed.dismissed ? profile.id : null,
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
