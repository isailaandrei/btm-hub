import {
  appendEmailEvent,
  markRecipientFailed,
  markRecipientSent,
  updateCampaignSendCounts,
} from "@/lib/data/email-campaigns";
import type { EmailCampaign, EmailCampaignRecipient } from "@/types/database";
import type { EmailProvider } from "./provider/types";

const SEND_CHUNK_SIZE = 25;

function buildReplyTo(recipientId: string): string {
  return `r-${recipientId}@replies.behind-the-mask.com`;
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
          const result = await input.provider.sendEmail({
            recipientId: recipient.id,
            to: recipient.email,
            from: `${input.campaign.from_name} <${input.campaign.from_email}>`,
            replyTo: buildReplyTo(recipient.id),
            subject: input.campaign.subject,
            html: input.campaign.html_snapshot,
            text: input.campaign.text_snapshot,
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
