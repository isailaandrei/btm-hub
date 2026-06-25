import type { EmailSend } from "@/types/database";

function count(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Triage priority for a send in the Sent list (lower = surfaced higher):
 *   0 — has delivery failures (bounced/failed, or a failed/partially_failed
 *       status): the rows an admin most needs to see and debug.
 *   1 — clean delivery but had unsubscribes: worth noticing, not an error.
 *   2 — everything else.
 */
export function sendTriageRank(send: EmailSend): number {
  const hasFailures =
    send.status === "failed" ||
    send.status === "partially_failed" ||
    count(send.failed_count) + count(send.bounced_count) > 0;
  if (hasFailures) return 0;
  if (count(send.unsubscribed_count) > 0) return 1;
  return 2;
}

function sendTime(send: Pick<EmailSend, "confirmed_at" | "created_at">): number {
  const time = new Date(send.confirmed_at ?? send.created_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Order the Sent emails list for triage: failures first, then sends with
 * unsubscribes, then the rest — each group most-recent-first (matching the
 * timing shown on the row). Pure and non-mutating; returns a new array.
 */
export function sortSendsForTriage<T extends EmailSend>(sends: T[]): T[] {
  return [...sends].sort((a, b) => {
    const rankDiff = sendTriageRank(a) - sendTriageRank(b);
    if (rankDiff !== 0) return rankDiff;
    return sendTime(b) - sendTime(a);
  });
}
