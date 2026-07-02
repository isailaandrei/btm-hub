import { NextResponse } from "next/server";
import { getStreamChatThreadNotificationContext } from "@/lib/data/chat-threads";
import { createStreamMessageNotifications } from "@/lib/data/stream-notifications";
import { toNotificationPreview } from "@/lib/notifications/notifications";
import { createStreamServerClient } from "@/lib/stream/server";

export const runtime = "nodejs";

// Provider-callback route — keep it storm-proof (CLAUDE.md invariant; Jun 2026
// Fluid-burn incident):
//   1. The DB work (thread-context read + notification insert) is bounded by
//      AbortSignal timeouts in its data functions, so a saturated DB can't hold
//      this handler open until maxDuration.
//   2. Internal/DB failures ACK 2xx (logged), never 5xx — Stream retries 5xx, and
//      a retry under DB pressure amplifies load. Signature failures stay 401.
// A missing channel->thread mapping is NOT a transient race: the mapping row is
// inserted + committed before the Stream channel is created (see
// getOrCreateDirectChatThread), and a channel must exist before any message.new,
// so retrying can never make the mapping appear — log and ACK rather than 500.
export const maxDuration = 20;

type StreamWebhookPayload = {
  type?: unknown;
  cid?: unknown;
  channel_id?: unknown;
  message?: {
    id?: unknown;
    text?: unknown;
    user?: {
      id?: unknown;
    };
  };
  user?: {
    id?: unknown;
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function getChannelId(payload: StreamWebhookPayload, cid: string): string {
  return asString(payload.channel_id) ?? cid.split(":")[1] ?? cid;
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stream signature" }, { status: 401 });
  }

  const body = await request.text();
  const stream = createStreamServerClient();
  if (!stream.verifyWebhook(body, signature)) {
    return NextResponse.json({ error: "Invalid Stream signature" }, { status: 401 });
  }

  let payload: StreamWebhookPayload;
  try {
    payload = JSON.parse(body) as StreamWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type !== "message.new") {
    return NextResponse.json({ ok: true, notifications: 0 });
  }

  const cid = asString(payload.cid);
  const streamMessageId = asString(payload.message?.id);
  if (!cid || !streamMessageId) {
    return NextResponse.json({ error: "Invalid Stream message payload" }, { status: 400 });
  }

  const senderId = asString(payload.message?.user?.id) ?? asString(payload.user?.id);
  if (!senderId) {
    return NextResponse.json({ error: "Invalid Stream sender payload" }, { status: 400 });
  }

  try {
    const context = await getStreamChatThreadNotificationContext({
      streamChannelCid: cid,
      senderId,
    });

    if (!context) {
      // No app thread mapping for this channel. The mapping is written before the
      // Stream channel exists, so this is never a transient race a retry fixes —
      // a 5xx here would just make Stream retry-storm. Log loudly and ACK 2xx.
      console.warn(
        `[stream-webhook] No app chat thread mapping for Stream channel ${cid} — ACKed 2xx (not retryable)`,
      );
      return NextResponse.json({ ok: true, notifications: 0, unmapped: true });
    }

    const bodyPreview = toNotificationPreview(
      asString(payload.message?.text) ?? "",
      "text",
    );
    const streamChannelId = getChannelId(payload, cid);

    await createStreamMessageNotifications({
      threadId: context.thread.id,
      recipientIds: context.recipientIds,
      actorId: senderId,
      streamMessageId,
      streamChannelCid: cid,
      streamChannelId,
      bodyPreview,
    });

    return NextResponse.json({
      ok: true,
      notifications: context.recipientIds.length,
    });
  } catch (error) {
    // Internal/DB failure (incl. a bounded-call timeout). ACK 2xx so Stream
    // doesn't retry-storm a fixed-capacity server; log loudly with context.
    console.error(
      "[stream-webhook] Failed to process message.new — ACKed 2xx to avoid a retry storm",
      {
        cid,
        senderId,
        streamMessageId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return NextResponse.json({ ok: true, notifications: 0, deferred: true });
  }
}
