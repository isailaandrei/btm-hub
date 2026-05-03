import type {
  Contact,
  ContactEmailPreference,
  EmailRecipientStatus,
  EmailSendKind,
  EmailSuppression,
} from "@/types/database";

export type EmailSkipReason = "newsletter_unsubscribed" | "suppressed";

export interface EligibleEmailRecipient {
  contactId: string;
  email: string;
  name: string;
  personalization: Record<string, unknown>;
}

export interface SkippedEmailRecipient {
  contactId: string;
  email: string;
  name: string;
  reason: EmailSkipReason;
  status: Extract<
    EmailRecipientStatus,
    "skipped_unsubscribed" | "skipped_suppressed"
  >;
}

export interface EmailEligibilityResult {
  eligible: EligibleEmailRecipient[];
  skipped: SkippedEmailRecipient[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasNewsletterUnsubscribe(
  contact: Contact,
  preferencesByContactId: Map<string, ContactEmailPreference>,
): boolean {
  return Boolean(
    preferencesByContactId.get(contact.id)?.newsletter_unsubscribed_at,
  );
}

function isSuppressed(
  contact: Contact,
  suppressionsByContactId: Map<string, EmailSuppression>,
  suppressionsByEmail: Map<string, EmailSuppression>,
): boolean {
  return (
    suppressionsByContactId.has(contact.id) ||
    suppressionsByEmail.has(normalizeEmail(contact.email))
  );
}

function personalizationForContact(contact: Contact): Record<string, unknown> {
  return {
    contact: {
      id: contact.id,
      name: contact.name,
      email: normalizeEmail(contact.email),
    },
  };
}

export function resolveEmailEligibility(input: {
  kind: EmailSendKind;
  contacts: Contact[];
  preferences: ContactEmailPreference[];
  suppressions: EmailSuppression[];
  selectedContactIds?: string[];
}): EmailEligibilityResult {
  const selectedContactIds = input.selectedContactIds ?? [];
  if (input.kind === "outreach" && selectedContactIds.length === 0) {
    throw new Error("Select at least one contact");
  }

  const selectedSet = new Set(selectedContactIds);
  const preferencesByContactId = new Map(
    input.preferences.map((preference) => [preference.contact_id, preference]),
  );
  const activeSuppressions = input.suppressions.filter(
    (suppression) => !suppression.lifted_at,
  );
  const suppressionsByContactId = new Map(
    activeSuppressions.flatMap((suppression) =>
      suppression.contact_id ? [[suppression.contact_id, suppression]] : [],
    ),
  );
  const suppressionsByEmail = new Map(
    activeSuppressions.map((suppression) => [
      normalizeEmail(suppression.email),
      suppression,
    ]),
  );

  const contacts =
    input.kind === "broadcast"
      ? input.contacts
      : input.contacts.filter((contact) => selectedSet.has(contact.id));

  const eligible: EligibleEmailRecipient[] = [];
  const skipped: SkippedEmailRecipient[] = [];

  for (const contact of contacts) {
    const email = normalizeEmail(contact.email);
    const base = { contactId: contact.id, email, name: contact.name };

    if (isSuppressed(contact, suppressionsByContactId, suppressionsByEmail)) {
      skipped.push({
        ...base,
        reason: "suppressed",
        status: "skipped_suppressed",
      });
      continue;
    }

    if (
      input.kind === "broadcast" &&
      hasNewsletterUnsubscribe(contact, preferencesByContactId)
    ) {
      skipped.push({
        ...base,
        reason: "newsletter_unsubscribed",
        status: "skipped_unsubscribed",
      });
      continue;
    }

    eligible.push({
      ...base,
      personalization: personalizationForContact(contact),
    });
  }

  return { eligible, skipped };
}
