import { timingSafeEqual } from "node:crypto";
import {
  DEFAULT_MAX_DIGEST_WINDOWS_PER_RUN,
  processConversationDigestWindows,
} from "@/lib/conversations/digests";

// Bound the invocation: the work is capped to a fixed number of windows per run
// (a large backlog drains across the daily pg_cron schedule), but each window
// still makes a model call, so keep a generous ceiling well under the platform
// max. The route returns remainingWindows so operators can see backlog depth.
export const maxDuration = 300;

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

  const summary = await processConversationDigestWindows({
    maxWindows: DEFAULT_MAX_DIGEST_WINDOWS_PER_RUN,
  });
  return Response.json({ ok: true, summary });
}
