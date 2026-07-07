import { timingSafeEqual } from "node:crypto";
import {
  DEFAULT_MAX_MEDIA_PER_RUN,
  archiveConversationMediaBatch,
} from "@/lib/conversations/media-archive";

// Bounded like the digest cron: a fixed number of attachments per run (a
// backlog drains across the daily pg_cron schedule). Each item is a
// 15s-bounded fetch + a storage upload, processed 4 at a time, so the batch
// fits well inside the ceiling. The summary includes `remaining` so operators
// can see backlog depth.
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

  const summary = await archiveConversationMediaBatch({
    maxItems: DEFAULT_MAX_MEDIA_PER_RUN,
  });
  return Response.json({ ok: true, summary });
}
