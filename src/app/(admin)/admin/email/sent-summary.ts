import type { EmailSend } from "@/types/database";

export interface EmailSendRowSummary {
  /** "142 recipients" / "1 recipient" — drawn from the send's resolved count. */
  recipientText: string;
  /** "Broadcast" / "Outreach". */
  kindLabel: string;
  /** Saved list/segment name when the send recorded one, else null. */
  audienceName: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The audience source label persisted on a send (e.g. a list or segment name),
 * or null when the send predates audience tracking or targeted an ad-hoc
 * selection. Read defensively: metadata is free-form JSONB.
 */
export function getSendAudienceName(send: Pick<EmailSend, "metadata">): string | null {
  const audience = isRecord(send.metadata) ? send.metadata.audience : null;
  if (!isRecord(audience)) return null;
  const label = audience.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

/**
 * Build the glanceable label for a Sent-tab row. Sends almost always share the
 * same subject ("Hello {{contact.name}}"), so the row leads with date + count +
 * audience instead — these actually tell sends apart.
 */
export function buildSentRowSummary(send: EmailSend): EmailSendRowSummary {
  const recipientCount =
    typeof send.recipient_count === "number" && Number.isFinite(send.recipient_count)
      ? send.recipient_count
      : 0;

  return {
    recipientText: `${recipientCount} ${
      recipientCount === 1 ? "recipient" : "recipients"
    }`,
    kindLabel: send.kind === "broadcast" ? "Broadcast" : "Outreach",
    audienceName: getSendAudienceName(send),
  };
}
