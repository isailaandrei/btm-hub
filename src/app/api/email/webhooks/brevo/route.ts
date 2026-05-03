import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  appendEmailEvent,
  getEmailRecipientByProviderMessage,
  suppressEmailFromProvider,
  updateEmailSendCounts,
  updateRecipientForProviderEvent,
} from "@/lib/data/email-sends";
import { createBrevoEmailProvider } from "@/lib/email/provider/brevo";
import type { NormalizedProviderEvent } from "@/lib/email/provider/types";
import { getBrevoWebhookToken } from "@/lib/email/settings";

function verifyToken(request: Request): boolean {
  const configured = getBrevoWebhookToken();
  if (!configured) return false;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-brevo-webhook-token") ?? url.searchParams.get("token");
  return provided === configured;
}

function fingerprint(event: NormalizedProviderEvent): string {
  if (event.providerEventId) {
    return `${event.provider}:event:${event.providerEventId}`;
  }
  const hash = createHash("sha256")
    .update(JSON.stringify(event.payload))
    .digest("hex");
  return `${event.provider}:payload:${hash}`;
}

async function applyEvent(event: NormalizedProviderEvent) {
  const eventType = event.type === "bounced" ? "bounced" : event.type;
  if (!event.providerMessageId) {
    await appendEmailEvent({
      sendId: null,
      recipientId: null,
      contactId: null,
      type: eventType,
      provider: event.provider,
      providerEventId: event.providerEventId,
      providerMessageId: event.providerMessageId,
      eventFingerprint: fingerprint(event),
      occurredAt: event.occurredAt,
      payload: event.payload,
    });
    return;
  }

  const mapping = {
    delivered: ["delivered", "delivered_at"],
    opened: ["opened", "opened_at"],
    clicked: ["clicked", "clicked_at"],
    bounced: ["bounced", "bounced_at"],
    complained: ["complained", "complained_at"],
    unsubscribed: ["unsubscribed", "unsubscribed_at"],
  } as const;

  const mapped = event.type in mapping ? mapping[event.type as keyof typeof mapping] : null;
  const recipient = mapped
    ? await updateRecipientForProviderEvent({
        provider: event.provider,
        providerMessageId: event.providerMessageId,
        status: mapped[0],
        timestampField: mapped[1],
        occurredAt: event.occurredAt,
      })
    : await getEmailRecipientByProviderMessage({
        provider: event.provider,
        providerMessageId: event.providerMessageId,
      });

  await appendEmailEvent({
    sendId: recipient?.send_id ?? null,
    recipientId: recipient?.id ?? null,
    contactId: recipient?.contact_id ?? null,
    type: eventType,
    provider: event.provider,
    providerEventId: event.providerEventId,
    providerMessageId: event.providerMessageId,
    eventFingerprint: fingerprint(event),
    occurredAt: event.occurredAt,
    payload: event.payload,
  });

  const shouldSuppressBounce =
    event.type === "bounced" &&
    (event.rawEvent === "hard_bounce" || event.rawEvent === "invalid_email");
  if (recipient && (shouldSuppressBounce || event.type === "complained")) {
    await suppressEmailFromProvider({
      contactId: recipient.contact_id,
      email: recipient.email,
      reason:
        event.type === "complained"
          ? "spam_complaint"
          : event.rawEvent === "invalid_email"
            ? "invalid_address"
            : "hard_bounce",
      detail:
        event.type === "complained"
          ? "Brevo spam complaint"
          : `Brevo ${event.rawEvent ?? "bounce"}`,
      provider: event.provider,
      providerEventId: event.providerEventId,
    });
  }

  if (recipient?.send_id) {
    await updateEmailSendCounts(recipient.send_id);
  }
}

export async function POST(request: Request) {
  if (!getBrevoWebhookToken()) {
    return NextResponse.json({ error: "Brevo webhook disabled" }, { status: 404 });
  }
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = createBrevoEmailProvider("webhook-parser-only");
  const events = provider.parseWebhook(payload);
  for (const event of events) {
    await applyEvent(event);
  }

  return NextResponse.json({ ok: true, events: events.length });
}
