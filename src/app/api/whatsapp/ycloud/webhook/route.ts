import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NormalizedConversationMessage } from "@/lib/conversations/ingestion/adapter";
import {
  parseYCloudEchoEvent,
  parseYCloudHistoryEvent,
  YCloudWhatsAppAdapter,
} from "@/lib/conversations/ingestion/ycloud-whatsapp";
import {
  buildContactDigitIndex,
  matchContactByDigits,
  type ContactPhoneMatch,
} from "@/lib/conversations/phone";
import { loadContactPhoneIndexRecords } from "@/lib/data/contact-phone-index";
import {
  updateConversationMessageMatch,
  upsertConversationMessage,
} from "@/lib/data/conversations";

// A webhook only needs to verify, persist, and acknowledge — it must never hold
// a (Fluid) function instance open for the 300s project default. Each DB call
// below is bounded well under this; 20s is a generous backstop so a degraded
// database fails the request fast instead of accruing minutes of
// provisioned-memory time per call. See the Jun 2026 Fluid-burn incident.
export const maxDuration = 20;

// INVARIANT — keep this handler storm-proof (Jun 2026 Fluid-burn incident):
//   1. Every awaited external call (DB, fetch, …) MUST be bounded by a timeout
//      (e.g. `AbortSignal.timeout`). An unbounded await can hang until
//      `maxDuration`, which Vercel returns as a 504 — a 5xx your `catch` never
//      sees, and which makes YCloud retry.
//   2. Internal/DB failures MUST resolve to a 2xx (logged), never a 5xx, so a
//      provider retry can't amplify load into a self-reinforcing storm.
// Adding a new unbounded await — or any 5xx error path — here reopens that hole.

// Live inbound messages.
const INBOUND_EVENT_TYPE = "whatsapp.inbound_message.received";
// WhatsApp Business App / Coexistence history sync — backfills past messages
// (both directions). Each event carries one message.
const HISTORY_EVENT_TYPE = "whatsapp.smb.history";
// Live outbound messages the business sent from the WhatsApp Business App / a
// linked device (Coexistence). Meta "messaging echo" carrying one outbound
// message — without this we only ever see inbound and the thread looks one-sided.
const ECHO_EVENT_TYPE = "whatsapp.smb.message.echoes";

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

/**
 * Stores a normalized message (idempotent by provider + provider_message_id, so
 * a re-run history sync never duplicates) and links it to a contact by the
 * customer phone — the sender for inbound, the recipient for outbound.
 */
async function ingestMessage(message: NormalizedConversationMessage) {
  let stored: { id: string; contactId: string | null };
  try {
    stored = await upsertConversationMessage({
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
  } catch (error) {
    // Fail loud in our logs, but ACK 2xx so YCloud doesn't retry-storm us into a
    // self-reinforcing meltdown (a returned 5xx triggers provider retries; under
    // DB pressure each retry then hangs and burns Fluid provisioned memory — the
    // Jun 2026 incident). A dropped event is recoverable: the WhatsApp history
    // sync (whatsapp.smb.history) re-delivers past messages on demand.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      "[ycloud-webhook] failed to store message; acknowledging to avoid retry storm",
      {
        provider: message.provider,
        providerMessageId: message.providerMessageId,
        detail,
      },
    );
    return {
      ok: false as const,
      stored: false as const,
      providerMessageId: message.providerMessageId,
      detail,
    };
  }

  const customerIdentifier =
    message.direction === "inbound"
      ? message.fromIdentifier
      : message.toIdentifier;

  try {
    const records = await loadContactPhoneIndexRecords();
    const match = matchContactByDigits(
      buildContactDigitIndex(records),
      customerIdentifier,
    );
    const contact = contactFieldsForMatch(match);

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

    return {
      ok: true as const,
      messageId: stored.id,
      contactId: contact.contactId,
      matchStatus: contact.matchStatus,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn("[ycloud-webhook] stored message but phone matching failed", {
      messageId: stored.id,
      detail,
    });
    return {
      ok: true as const,
      messageId: stored.id,
      contactId: null,
      matchStatus: "unmatched" as const,
      warning: "Phone matching failed after raw message storage.",
      detail,
    };
  }
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

  let message: NormalizedConversationMessage;
  try {
    if (type === INBOUND_EVENT_TYPE) {
      message = new YCloudWhatsAppAdapter().parse(event);
    } else if (type === HISTORY_EVENT_TYPE) {
      message = parseYCloudHistoryEvent(event);
    } else if (type === ECHO_EVENT_TYPE) {
      message = parseYCloudEchoEvent(event);
    } else {
      // Acknowledge other events (status updates, etc.) without ingesting.
      return NextResponse.json({ ok: true, ignored: true, type });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Invalid YCloud payload", detail },
      { status: 400 },
    );
  }

  const result = await ingestMessage(message);
  return NextResponse.json(result);
}
