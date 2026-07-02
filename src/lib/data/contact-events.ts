import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { ContactEvent, ContactEventType } from "@/types/database";

// Bound the DB calls on the email-webhook delivery-status path (called from the
// storm-proofed Brevo webhook) so a saturated database fails fast instead of
// hanging until the function's max duration. See the CLAUDE.md storm-proofing
// invariant and the Jun 2026 Fluid-burn incident.
const EMAIL_WEBHOOK_DB_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getContactEvents = cache(async function getContactEvents(
  contactId: string,
): Promise<ContactEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .select("*")
    .eq("contact_id", contactId)
    .order("happened_at", { ascending: false });

  if (error) throw new Error(`Failed to load contact events: ${error.message}`);
  return (data ?? []) as ContactEvent[];
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface CreateContactEventInput {
  contactId: string;
  type: ContactEventType;
  customLabel: string | null;
  body: string;
  happenedAt: string;
  authorId: string;
  authorName: string;
}

export interface CreateSystemContactEventInput extends CreateContactEventInput {
  metadata?: Record<string, unknown>;
}

export type EmailTimelineDeliveryStatus = "pending" | "delivered" | "not_delivered";

export async function createContactEvent(input: CreateContactEventInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .insert({
      contact_id: input.contactId,
      type: input.type,
      custom_label: input.customLabel,
      body: input.body,
      happened_at: input.happenedAt,
      author_id: input.authorId,
      author_name: input.authorName,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create contact event: ${error.message}`);
  return data as ContactEvent;
}

export async function createSystemContactEvent(
  input: CreateSystemContactEventInput,
) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("contact_events")
    .insert({
      contact_id: input.contactId,
      type: input.type,
      custom_label: input.customLabel,
      body: input.body,
      happened_at: input.happenedAt,
      author_id: input.authorId,
      author_name: input.authorName,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create contact event: ${error.message}`);
  return data as ContactEvent;
}

export async function updateEmailSentContactEventDeliveryStatus(input: {
  recipientId: string;
  deliveryStatus: EmailTimelineDeliveryStatus;
  occurredAt: string;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("contact_events")
    .select("id, metadata")
    .eq("type", "custom")
    .eq("metadata->>source", "email_sends")
    .eq("metadata->>recipient_id", input.recipientId)
    .abortSignal(AbortSignal.timeout(EMAIL_WEBHOOK_DB_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load email contact event: ${error.message}`);
  }
  if (!data) return;

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const { error: updateError } = await supabase
    .from("contact_events")
    .update({
      metadata: {
        ...metadata,
        delivery_status: input.deliveryStatus,
        delivery_status_at: input.occurredAt,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .abortSignal(AbortSignal.timeout(EMAIL_WEBHOOK_DB_TIMEOUT_MS));

  if (updateError) {
    throw new Error(
      `Failed to update email contact event: ${updateError.message}`,
    );
  }
}

export interface UpdateContactEventInput {
  body?: string;
  customLabel?: string | null;
  happenedAt?: string;
}

export async function updateContactEvent(
  eventId: string,
  fields: UpdateContactEventInput,
) {
  await requireAdmin();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    edited_at: new Date().toISOString(),
  };
  if (fields.body !== undefined) patch.body = fields.body;
  if (fields.customLabel !== undefined) patch.custom_label = fields.customLabel;
  if (fields.happenedAt !== undefined) patch.happened_at = fields.happenedAt;

  const { data, error } = await supabase
    .from("contact_events")
    .update(patch)
    .eq("id", eventId)
    .select("id, contact_id, type")
    .maybeSingle();

  if (error) throw new Error(`Failed to update contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found");
  return data as { id: string; contact_id: string; type: ContactEventType };
}

export async function deleteContactEvent(eventId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .delete()
    .eq("id", eventId)
    .select("id, contact_id, type")
    .maybeSingle();

  if (error) throw new Error(`Failed to delete contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found");
  return data as { id: string; contact_id: string; type: ContactEventType };
}

export async function resolveContactEvent(eventId: string, resolverId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolverId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .in("type", ["info_requested", "awaiting_btm_response"])
    .select("id, contact_id")
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found or not resolvable");
  return data as { id: string; contact_id: string };
}

export async function unresolveContactEvent(eventId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .update({
      resolved_at: null,
      resolved_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .in("type", ["info_requested", "awaiting_btm_response"])
    .select("id, contact_id")
    .maybeSingle();

  if (error) throw new Error(`Failed to reopen contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found or not resolvable");
  return data as { id: string; contact_id: string };
}

// ---------------------------------------------------------------------------
// Contacts-list enrichment (all events, all contacts)
// ---------------------------------------------------------------------------

export interface ContactEventSummary {
  id: string;
  contact_id: string;
  type: ContactEventType;
  custom_label: string | null;
  happened_at: string;
  resolved_at: string | null;
}

export const getAllContactEventSummaries = cache(
  async function getAllContactEventSummaries(): Promise<ContactEventSummary[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contact_events")
      .select("id, contact_id, type, custom_label, happened_at, resolved_at");

    if (error) throw new Error(`Failed to load contact event summaries: ${error.message}`);
    return (data ?? []) as ContactEventSummary[];
  },
);
