"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { getContactById, getContacts } from "@/lib/data/contacts";
import {
  createEmailCampaign,
  insertEmailRecipients,
  listActiveEmailSuppressions,
  listContactEmailPreferences,
} from "@/lib/data/email-campaigns";
import { getEmailTemplateVersion } from "@/lib/data/email-templates";
import { resolveEmailEligibility } from "@/lib/email/eligibility";
import {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_EMAIL_REPLY_DOMAIN,
  DEFAULT_EMAIL_SENDING_DOMAIN,
} from "@/lib/email/types";
import { validateUUID } from "@/lib/validation-helpers";
import type { Contact, EmailCampaignKind } from "@/types/database";

const campaignKindSchema = z.enum(["broadcast", "outreach", "one_off"]);

const previewCampaignSchema = z.object({
  kind: campaignKindSchema,
  contactIds: z.array(z.string()).optional(),
  oneOffContactId: z.string().optional(),
  subject: z.string().trim().min(1, "Subject is required"),
  templateVersionId: z.string().min(1, "Template version is required"),
});

const draftCampaignSchema = previewCampaignSchema.extend({
  name: z.string().trim().min(1, "Campaign name is required"),
});

async function loadContactsForCampaign(input: {
  kind: EmailCampaignKind;
  contactIds?: string[];
  oneOffContactId?: string;
}): Promise<Contact[]> {
  if (input.kind === "broadcast") {
    return getContacts();
  }

  if (input.kind === "one_off") {
    if (!input.oneOffContactId) throw new Error("Contact is required");
    validateUUID(input.oneOffContactId, "contact");
    const contact = await getContactById(input.oneOffContactId);
    if (!contact) throw new Error("Contact not found");
    return [contact];
  }

  const selectedIds = input.contactIds ?? [];
  if (selectedIds.length === 0) throw new Error("Select at least one contact");
  for (const contactId of selectedIds) validateUUID(contactId, "contact");
  const selectedIdSet = new Set(selectedIds);
  return (await getContacts()).filter((contact) => selectedIdSet.has(contact.id));
}

async function resolvePreview(input: {
  kind: EmailCampaignKind;
  contactIds?: string[];
  oneOffContactId?: string;
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
  kind: "broadcast" | "outreach" | "one_off";
  contactIds?: string[];
  oneOffContactId?: string;
  subject: string;
  templateVersionId: string;
}): Promise<{
  eligibleCount: number;
  skipped: Array<{ contactId: string; email: string; name: string; reason: string }>;
}> {
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
  kind: "broadcast" | "outreach" | "one_off";
  name: string;
  subject: string;
  templateVersionId: string;
  contactIds?: string[];
  oneOffContactId?: string;
}): Promise<{ campaignId: string }> {
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
