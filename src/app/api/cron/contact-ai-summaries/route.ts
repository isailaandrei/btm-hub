import { timingSafeEqual } from "node:crypto";
import {
  DEFAULT_MAX_SUMMARIES_PER_RUN,
  processContactAiSummaries,
} from "@/lib/admin-ai/contact-summary";

// Bounded like the sibling crons: hash-checking the whole corpus is cheap;
// only stale contacts cost a model call, capped per run (a backlog drains
// across the nightly schedule). Runs AFTER the conversation-digest job so
// fresh digests are already part of the card being summarized.
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

  const summary = await processContactAiSummaries({
    maxContacts: DEFAULT_MAX_SUMMARIES_PER_RUN,
  });
  return Response.json({ ok: true, summary });
}
