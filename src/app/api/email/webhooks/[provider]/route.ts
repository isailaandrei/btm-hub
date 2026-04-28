import { NextResponse } from "next/server";
import {
  applyProviderEvent,
  storeInboundReplyAndForward,
} from "@/lib/data/email-campaigns";
import { getEmailProvider } from "@/lib/email/provider";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: providerName } = await context.params;
  const provider = getEmailProvider();
  if (provider.name !== providerName) {
    return NextResponse.json({ error: "Provider mismatch" }, { status: 400 });
  }

  const rawBody = await request.text();
  const verified = await provider.verifyWebhookSignature(rawBody, request.headers);
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = await provider.parseWebhook(JSON.parse(rawBody));
  if (parsed.kind === "event") {
    await applyProviderEvent(parsed.event);
  } else {
    await storeInboundReplyAndForward(parsed.reply, provider);
  }

  return NextResponse.json({ ok: true });
}
