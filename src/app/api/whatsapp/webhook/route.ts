import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { TwilioWhatsAppAdapter } from "@/lib/conversations/ingestion/twilio-whatsapp";
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

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signatureBase(url: string, payload: URLSearchParams): string {
  return (
    url +
    [...payload.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}${value}`)
      .join("")
  );
}

function getTwilioSignatureUrl(request: Request): string {
  const configuredUrl = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ??
    request.headers.get("host")?.trim();
  if (forwardedProto && forwardedHost) {
    const requestUrl = new URL(request.url);
    return `${forwardedProto}://${forwardedHost}${requestUrl.pathname}${requestUrl.search}`;
  }

  return request.url;
}

function verifyTwilioSignature(request: Request, payload: URLSearchParams): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return false;
  const provided = request.headers.get("x-twilio-signature") ?? "";
  if (!provided) return false;
  const expected = createHmac("sha1", authToken)
    .update(signatureBase(getTwilioSignatureUrl(request), payload))
    .digest("base64");
  return constantTimeEqual(provided, expected);
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
  const rawBody = await request.text();
  const payload = new URLSearchParams(rawBody);

  if (!verifyTwilioSignature(request, payload)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let message;
  try {
    message = new TwilioWhatsAppAdapter().parse(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Invalid Twilio payload", detail },
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
    console.warn("[whatsapp-webhook] stored message but phone matching failed", {
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
