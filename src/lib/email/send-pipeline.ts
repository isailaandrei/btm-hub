import {
  appendEmailEvent,
  markRecipientFailed,
  markRecipientSent,
  updateCampaignSendCounts,
} from "@/lib/data/email-campaigns";
import type { EmailCampaign, EmailCampaignRecipient } from "@/types/database";
import type { EmailProvider } from "./provider/types";
import { renderMjmlEmail } from "./rendering/mjml";
import type { EmailRenderVariables } from "./rendering/variables";

const SEND_CHUNK_SIZE = 25;

function buildReplyTo(recipientId: string): string {
  return `r-${recipientId}@replies.behind-the-mask.com`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildRenderVariables(
  recipient: EmailCampaignRecipient,
): EmailRenderVariables {
  const personalization = asRecord(recipient.personalization_snapshot);
  const contact = asRecord(personalization.contact);

  return {
    ...personalization,
    contact: {
      id:
        typeof contact.id === "string"
          ? contact.id
          : (recipient.contact_id ?? undefined),
      name:
        typeof contact.name === "string"
          ? contact.name
          : recipient.contact_name_snapshot,
      email: typeof contact.email === "string" ? contact.email : recipient.email,
    },
  };
}

async function renderRecipientEmail(
  campaign: EmailCampaign,
  recipient: EmailCampaignRecipient,
) {
  if (!campaign.mjml_snapshot.trim()) {
    return {
      subject: campaign.subject,
      html: campaign.html_snapshot,
      text: campaign.text_snapshot,
    };
  }

  return renderMjmlEmail({
    subject: campaign.subject,
    mjml: campaign.mjml_snapshot,
    variables: buildRenderVariables(recipient),
  });
}

export async function sendCampaignRecipients(input: {
  provider: EmailProvider;
  campaign: EmailCampaign;
  recipients: EmailCampaignRecipient[];
}): Promise<void> {
  const sendable = input.recipients.filter(
    (recipient) => recipient.status === "queued",
  );

  for (let index = 0; index < sendable.length; index += SEND_CHUNK_SIZE) {
    const chunk = sendable.slice(index, index + SEND_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (recipient) => {
        try {
          const rendered = await renderRecipientEmail(input.campaign, recipient);
          const result = await input.provider.sendEmail({
            recipientId: recipient.id,
            to: recipient.email,
            from: `${input.campaign.from_name} <${input.campaign.from_email}>`,
            replyTo: buildReplyTo(recipient.id),
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            metadata: {
              campaignId: input.campaign.id,
              campaignKind: input.campaign.kind,
              recipientId: recipient.id,
              contactId: recipient.contact_id ?? "",
            },
          });

          await markRecipientSent(recipient.id, {
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            providerMetadata: result.raw,
          });
          await appendEmailEvent({
            campaignId: input.campaign.id,
            recipientId: recipient.id,
            contactId: recipient.contact_id,
            type: "sent",
            provider: result.provider,
            providerEventId: null,
            providerMessageId: result.providerMessageId,
            occurredAt: new Date().toISOString(),
            payload: result.raw,
          });
        } catch (error) {
          await markRecipientFailed(
            recipient.id,
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    );
  }

  await updateCampaignSendCounts(input.campaign.id);
}
