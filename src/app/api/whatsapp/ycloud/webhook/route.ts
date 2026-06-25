import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { YCloudWhatsAppAdapter } from "@/lib/conversations/ingestion/ycloud-whatsapp";
import {
  buildContactPhoneIndex,
  matchContactByPhone,
  type ContactPhoneMatch,
} from "@/lib/conversations/phone";
import { loadContactPhoneIndexRecords } from "@/lib/data/contact-phone-index";
import {
  updateConversationMessageMatch,
  upsertConversationMessage,
} from "@/lib/data/conversations";

// Only inbound messages are ingested. Other subscribed events (e.g. message
// status updates) are acknowledged with 200 so YCloud does not retry them.
const INBOUND_EVENT_TYPE = "whatsapp.inbound_message.received";

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// YCloud sends `YCloud-Signature: t={unixSeconds},s={hexHmacSha256}` where the
// signature is HMAC-SHA256 over `{t}.{rawBody}` keyed with the endpoint secret.
// https://helpdocs.ycloud.com/help-center/developer/webhook
function parseSignatureHeader(
  header: string | null,
): { timestamp: string; signature: string } | null {
  if (!header) return null;
  let timestamp = "";
  let signature = "";
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "s") signature = value;
  }
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

function verifyYCloudSignature(
  header: string | null,
  rawBody: string,
  secret: string,
): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest("hex");
  return constantTimeEqual(parsed.signature, expected);
}

function eventType(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const type = (event as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

function contactFieldsForMatch(match: ContactPhoneMatch): {
  contactId: string | null;
  matchStatus: "matched" | "unmatched" | "ambiguous";
  matchedVia: string | null;
} {
  if (match.status === "matched") {
    return {
      contactId: match.contactId,
      matchStatus: "matched",
      matchedVia: match.matchedVia,
    };
  }
  if (match.status === "ambiguous") {
    return {
      contactId: null,
      matchStatus: "ambiguous",
      matchedVia: JSON.stringify(match.matchedVia),
    };
  }
  return {
    contactId: null,
    matchStatus: "unmatched",
    matchedVia: null,
  };
}

export async function POST(request: Request) {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[ycloud-webhook] YCLOUD_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  if (!verifyYCloudSignature(request.headers.get("ycloud-signature"), rawBody, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const type = eventType(event);
  if (type !== INBOUND_EVENT_TYPE) {
    // Acknowledge non-inbound events (status updates, etc.) without ingesting.
    return NextResponse.json({ ok: true, ignored: true, type });
  }

  let message;
  try {
    message = new YCloudWhatsAppAdapter().parse(event);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Invalid YCloud payload", detail },
      { status: 400 },
    );
  }

  const stored = await upsertConversationMessage({
    contactId: null,
    source: message.source,
    provider: message.provider,
    providerMessageId: message.providerMessageId,
    direction: message.direction,
    fromIdentifier: message.fromIdentifier,
    toIdentifier: message.toIdentifier,
    body: message.body,
    media: message.media,
    happenedAt: message.happenedAt,
    rawPayload: message.rawPayload,
    matchStatus: "unmatched",
    matchedVia: null,
  });

  let contact: ReturnType<typeof contactFieldsForMatch>;
  try {
    const records = await loadContactPhoneIndexRecords();
    const match = matchContactByPhone(
      buildContactPhoneIndex(records),
      message.fromIdentifier,
    );
    contact = contactFieldsForMatch(match);

    await updateConversationMessageMatch({
      messageId: stored.id,
      contactId: contact.contactId,
      matchStatus: contact.matchStatus,
      matchedVia: contact.matchedVia,
      rawPayload: {
        ...message.rawPayload,
        phoneMatch: match,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn("[ycloud-webhook] stored message but phone matching failed", {
      messageId: stored.id,
      detail,
    });
    return NextResponse.json({
      ok: true,
      messageId: stored.id,
      contactId: null,
      matchStatus: "unmatched",
      warning: "Phone matching failed after raw message storage.",
      detail,
    });
  }

  return NextResponse.json({
    ok: true,
    messageId: stored.id,
    contactId: contact.contactId,
    matchStatus: contact.matchStatus,
  });
}
