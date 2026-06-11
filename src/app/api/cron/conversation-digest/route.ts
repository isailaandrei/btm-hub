import { timingSafeEqual } from "node:crypto";
import { processConversationDigestWindows } from "@/lib/conversations/digests";

function constantTimeAuthEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeAuthEqual(authHeader, `Bearer ${cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await processConversationDigestWindows();
  return Response.json({ ok: true, summary });
}
