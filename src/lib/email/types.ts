import type {
  EmailCampaignKind,
  EmailCampaignRecipient,
  EmailEventType,
  EmailRecipientStatus,
  EmailSuppressionReason,
} from "@/types/database";

export const EMAIL_ASSET_BUCKET = "email-assets";
export const EMAIL_PROVIDER_POSTMARK = "postmark";
export const EMAIL_PROVIDER_FAKE = "fake";
export const DEFAULT_EMAIL_FROM_NAME = "Behind The Mask";
export const DEFAULT_EMAIL_SENDING_DOMAIN = "mail.behind-the-mask.com";
export const DEFAULT_EMAIL_REPLY_DOMAIN = "replies.behind-the-mask.com";
export const DEFAULT_EMAIL_TRACKING_DOMAIN = "links.behind-the-mask.com";

export type CampaignKind = EmailCampaignKind;
export type RecipientStatus = EmailRecipientStatus;
export type EventType = EmailEventType;
export type SuppressionReason = EmailSuppressionReason;

export interface EmailRecipientCandidate {
  contactId: string;
  email: string;
  name: string;
  personalization: Record<string, unknown>;
}

export interface EmailRecipientEligibility {
  eligible: EmailRecipientCandidate[];
  skipped: Array<{
    contactId: string;
    email: string;
    name: string;
    reason: "missing_email" | "newsletter_unsubscribed" | "suppressed";
  }>;
}

export interface EmailSendSnapshot {
  subject: string;
  html: string;
  text: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
}

export interface CampaignRecipientForSend extends EmailCampaignRecipient {
  personalization_snapshot: Record<string, unknown>;
}
