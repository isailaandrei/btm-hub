import type { EmailCampaignKind } from "@/types/database";
import type { EmailRecipientEligibility } from "./types";

interface ContactLike {
  id: string;
  email: string;
  name: string;
}

interface PreferenceLike {
  contact_id: string;
  newsletter_unsubscribed_at: string | null;
}

interface SuppressionLike {
  contact_id: string | null;
  email: string;
}

export function resolveEmailEligibility(input: {
  kind: EmailCampaignKind;
  contacts: ContactLike[];
  preferences: PreferenceLike[];
  suppressions: SuppressionLike[];
}): EmailRecipientEligibility {
  const preferencesByContact = new Map(
    input.preferences.map((preference) => [preference.contact_id, preference]),
  );
  const suppressedContactIds = new Set(
    input.suppressions
      .map((suppression) => suppression.contact_id)
      .filter((id): id is string => Boolean(id)),
  );
  const suppressedEmails = new Set(
    input.suppressions.map((suppression) => suppression.email.trim().toLowerCase()),
  );

  const eligible: EmailRecipientEligibility["eligible"] = [];
  const skipped: EmailRecipientEligibility["skipped"] = [];

  for (const contact of input.contacts) {
    const email = contact.email.trim().toLowerCase();
    if (!email) {
      skipped.push({ contactId: contact.id, email, name: contact.name, reason: "missing_email" });
      continue;
    }

    if (suppressedContactIds.has(contact.id) || suppressedEmails.has(email)) {
      skipped.push({ contactId: contact.id, email, name: contact.name, reason: "suppressed" });
      continue;
    }

    const preference = preferencesByContact.get(contact.id);
    if (input.kind === "broadcast" && preference?.newsletter_unsubscribed_at) {
      skipped.push({
        contactId: contact.id,
        email,
        name: contact.name,
        reason: "newsletter_unsubscribed",
      });
      continue;
    }

    eligible.push({
      contactId: contact.id,
      email,
      name: contact.name,
      personalization: {
        contact: {
          id: contact.id,
          name: contact.name,
          email,
        },
      },
    });
  }

  return { eligible, skipped };
}
