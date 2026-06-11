import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { TwilioWhatsAppAdapter } from "@/lib/conversations/ingestion/twilio-whatsapp";
import {
  buildContactPhoneIndex,
  matchContactByPhone,
  type ContactPhoneMatch,
} from "@/lib/conversations/phone";
import { loadContactPhoneIndexRecords } from "@/lib/data/contact-phone-index";
import { upsertConversationMessage } from "@/lib/data/conversations";

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

function verifyTwilioSignature(request: Request, payload: URLSearchParams): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return false;
  const provided = request.headers.get("x-twilio-signature") ?? "";
  if (!provided) return false;
  const expected = createHmac("sha1", authToken)
    .update(signatureBase(request.url, payload))
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

  const records = await loadContactPhoneIndexRecords();
  const match = matchContactByPhone(
    buildContactPhoneIndex(records),
    message.fromIdentifier,
  );
  const contact = contactFieldsForMatch(match);

  const stored = await upsertConversationMessage({
    contactId: contact.contactId,
    source: message.source,
    provider: message.provider,
    providerMessageId: message.providerMessageId,
    direction: message.direction,
    fromIdentifier: message.fromIdentifier,
    toIdentifier: message.toIdentifier,
    body: message.body,
    media: message.media,
    happenedAt: message.happenedAt,
    rawPayload: {
      ...message.rawPayload,
      phoneMatch: match,
    },
    matchStatus: contact.matchStatus,
    matchedVia: contact.matchedVia,
  });

  return NextResponse.json({
    ok: true,
    messageId: stored.id,
    contactId: stored.contactId,
    matchStatus: contact.matchStatus,
  });
}
