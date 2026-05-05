import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  appendEmailEvent,
  attachProviderMessageToRecipient,
  getEmailRecipientByProviderMessage,
  recordProviderNewsletterUnsubscribe,
  suppressEmailFromProvider,
  updateEmailSendCounts,
  updateRecipientForProviderEvent,
} from "@/lib/data/email-sends";
import { updateEmailSentContactEventDeliveryStatus } from "@/lib/data/contact-events";
import { createBrevoEmailProvider } from "@/lib/email/provider/brevo";
import type { NormalizedProviderEvent } from "@/lib/email/provider/types";
import {
  getBrevoWebhookToken,
  isProductionEmailEnvironment,
} from "@/lib/email/settings";

function timingSafeMatches(provided: string, configured: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const configuredBuffer = Buffer.from(configured);
  return (
    providedBuffer.length === configuredBuffer.length &&
    timingSafeEqual(providedBuffer, configuredBuffer)
  );
}

function verifyToken(request: Request): boolean {
  const configured = getBrevoWebhookToken();
  if (!configured) return false;
  const url = new URL(request.url);
  const headerToken = request.headers.get("x-brevo-webhook-token");
  if (headerToken) return timingSafeMatches(headerToken, configured);
  const queryToken = url.searchParams.get("token");
  if (!queryToken || isProductionEmailEnvironment()) return false;
  return timingSafeMatches(queryToken, configured);
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

function readWebhookMetadata(payload: Record<string, unknown>): {
  sendId: string | null;
  recipientId: string | null;
  contactId: string | null;
} {
  const raw = payload["X-Mailin-custom"];
  if (typeof raw !== "string" || !raw.trim()) {
    return { sendId: null, recipientId: null, contactId: null };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { sendId: null, recipientId: null, contactId: null };
    }
    const metadata = parsed as Record<string, unknown>;
    return {
      sendId: typeof metadata.sendId === "string" ? metadata.sendId : null,
      recipientId:
        typeof metadata.recipientId === "string" ? metadata.recipientId : null,
      contactId:
        typeof metadata.contactId === "string" ? metadata.contactId : null,
    };
  } catch {
    return { sendId: null, recipientId: null, contactId: null };
  }
}

function deliveryStatusForEvent(event: NormalizedProviderEvent) {
  if (
    event.type === "delivered" ||
    event.type === "opened" ||
    event.type === "clicked"
  ) {
    return "delivered" as const;
  }
  if (event.type === "bounced") return "not_delivered" as const;
  if (event.type === "failed") return "not_delivered" as const;
  return null;
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
    opened: ["delivered", "opened_at"],
    clicked: ["clicked", "clicked_at"],
    bounced: ["bounced", "bounced_at"],
    failed: ["failed", "bounced_at"],
    complained: ["complained", "complained_at"],
    unsubscribed: ["unsubscribed", "unsubscribed_at"],
  } as const;

  const mapped =
    event.type in mapping ? mapping[event.type as keyof typeof mapping] : null;
  let recipient = mapped
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

  if (!recipient && event.providerMessageId) {
    const metadata = readWebhookMetadata(event.payload);
    if (metadata.recipientId) {
      await attachProviderMessageToRecipient({
        provider: event.provider,
        providerMessageId: event.providerMessageId,
        recipientId: metadata.recipientId,
        sendId: metadata.sendId,
        contactId: metadata.contactId,
      });
      recipient = mapped
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
    }
  }

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

  const deliveryStatus = deliveryStatusForEvent(event);
  if (recipient && deliveryStatus) {
    await updateEmailSentContactEventDeliveryStatus({
      recipientId: recipient.id,
      deliveryStatus,
      occurredAt: event.occurredAt,
    });
  }

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
  if (recipient && event.type === "unsubscribed") {
    await recordProviderNewsletterUnsubscribe({
      contactId: recipient.contact_id,
      source: `provider:${event.provider}`,
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
