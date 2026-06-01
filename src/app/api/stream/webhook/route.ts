import { NextResponse } from "next/server";
import { getStreamChatThreadNotificationContext } from "@/lib/data/chat-threads";
import { createStreamMessageNotifications } from "@/lib/data/stream-notifications";
import { toNotificationPreview } from "@/lib/notifications/notifications";
import { createStreamServerClient } from "@/lib/stream/server";

export const runtime = "nodejs";

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

  const context = await getStreamChatThreadNotificationContext({
    streamChannelCid: cid,
    senderId,
  });

  if (!context) {
    return NextResponse.json(
      { error: `No app chat thread mapping found for Stream channel ${cid}` },
      { status: 500 },
    );
  }

  const bodyPreview = toNotificationPreview(asString(payload.message?.text) ?? "", "text");
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

  return NextResponse.json({ ok: true, notifications: context.recipientIds.length });
}
