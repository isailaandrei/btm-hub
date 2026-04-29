"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getContacts } from "@/lib/data/contacts";
import {
  createEmailCampaign,
  insertEmailRecipients,
  listQueuedRecipients,
  listActiveEmailSuppressions,
  listContactEmailPreferences,
  queueCampaignForSending,
  suppressEmail,
} from "@/lib/data/email-campaigns";
import { getEmailTemplateVersion } from "@/lib/data/email-templates";
import { resolveEmailEligibility } from "@/lib/email/eligibility";
import { getEmailProvider } from "@/lib/email/provider";
import { sendCampaignRecipients } from "@/lib/email/send-pipeline";
import {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_EMAIL_REPLY_DOMAIN,
  DEFAULT_EMAIL_SENDING_DOMAIN,
} from "@/lib/email/types";
import { validateUUID } from "@/lib/validation-helpers";
import type {
  Contact,
  EmailSuppressionReason,
} from "@/types/database";

type CampaignComposerKind = "broadcast" | "outreach";

const campaignKindSchema = z.enum(["broadcast", "outreach"]);

const previewCampaignSchema = z.object({
  kind: campaignKindSchema,
  contactIds: z.array(z.string()).optional(),
  subject: z.string().trim().min(1, "Subject is required"),
  templateVersionId: z.string().min(1, "Template version is required"),
});

const draftCampaignSchema = previewCampaignSchema.extend({
  name: z.string().trim().min(1, "Campaign name is required"),
});

const suppressContactEmailSchema = z.object({
  contactId: z.string().min(1, "Contact is required"),
  email: z.string().trim().pipe(z.email("Email address is invalid")),
  reason: z.enum(["hard_bounce", "spam_complaint", "invalid_address", "manual", "do_not_contact"]),
  detail: z.string().trim().max(1000, "Detail must be 1000 characters or fewer"),
});

async function loadContactsForCampaign(input: {
  kind: CampaignComposerKind;
  contactIds?: string[];
}): Promise<Contact[]> {
  if (input.kind === "broadcast") {
    return getContacts();
  }

  const selectedIds = input.contactIds ?? [];
  if (selectedIds.length === 0) throw new Error("Select at least one contact");
  for (const contactId of selectedIds) validateUUID(contactId, "contact");
  const selectedIdSet = new Set(selectedIds);
  return (await getContacts()).filter((contact) => selectedIdSet.has(contact.id));
}

async function resolvePreview(input: {
  kind: CampaignComposerKind;
  contactIds?: string[];
}) {
  const [contacts, preferences, suppressions] = await Promise.all([
    loadContactsForCampaign(input),
    listContactEmailPreferences(),
    listActiveEmailSuppressions(),
  ]);

  return resolveEmailEligibility({
    kind: input.kind,
    contacts,
    preferences,
    suppressions,
  });
}

export async function previewCampaignAction(input: {
  kind: CampaignComposerKind;
  contactIds?: string[];
  subject: string;
  templateVersionId: string;
}): Promise<{
  eligibleCount: number;
  skipped: Array<{ contactId: string; email: string; name: string; reason: string }>;
}> {
  await requireAdmin();
  const parsed = previewCampaignSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid campaign preview");
  }
  validateUUID(parsed.data.templateVersionId, "template version");

  const preview = await resolvePreview(parsed.data);
  return {
    eligibleCount: preview.eligible.length,
    skipped: preview.skipped,
  };
}

export async function createCampaignDraftAction(input: {
  kind: CampaignComposerKind;
  name: string;
  subject: string;
  templateVersionId: string;
  contactIds?: string[];
}): Promise<{ campaignId: string }> {
  await requireAdmin();
  const parsed = draftCampaignSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid campaign draft");
  }
  validateUUID(parsed.data.templateVersionId, "template version");

  const [templateVersion, preview] = await Promise.all([
    getEmailTemplateVersion(parsed.data.templateVersionId),
    resolvePreview(parsed.data),
  ]);
  if (!templateVersion) throw new Error("Template version not found");

  const campaign = await createEmailCampaign({
    kind: parsed.data.kind,
    name: parsed.data.name,
    subject: parsed.data.subject,
    previewText: templateVersion.preview_text,
    fromEmail: `hello@${DEFAULT_EMAIL_SENDING_DOMAIN}`,
    fromName: DEFAULT_EMAIL_FROM_NAME,
    replyToEmail: `reply@${DEFAULT_EMAIL_REPLY_DOMAIN}`,
    templateVersionId: templateVersion.id,
    mjmlSnapshot: templateVersion.mjml,
    htmlSnapshot: templateVersion.html,
    textSnapshot: templateVersion.text,
  });

  await insertEmailRecipients({
    campaignId: campaign.id,
    recipients: preview.eligible,
  });

  revalidatePath("/admin");
  return { campaignId: campaign.id };
}

export async function confirmCampaignSendAction(
  campaignId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(campaignId, "campaign");
  const provider = getEmailProvider();
  const campaign = await queueCampaignForSending(campaignId);
  const recipients = await listQueuedRecipients(campaignId);

  after(async () => {
    await sendCampaignRecipients({ provider, campaign, recipients });
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function suppressContactEmailAction(input: {
  contactId: string;
  email: string;
  reason: EmailSuppressionReason;
  detail: string;
}): Promise<{ ok: true }> {
  await requireAdmin();
  const parsed = suppressContactEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid suppression");
  }
  validateUUID(parsed.data.contactId, "contact");

  await suppressEmail(parsed.data);
  revalidatePath("/admin");
  revalidatePath(`/admin/contacts/${parsed.data.contactId}`);
  return { ok: true };
}
