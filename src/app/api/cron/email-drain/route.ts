import { after } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { getEmailSendsNeedingProcessing } from "@/lib/data/email-sends";
import { getEmailProvider } from "@/lib/email/provider";
import { processEmailSendChunks } from "@/lib/email/send-pipeline";
import { triggerEmailWorker } from "@/lib/email/worker-trigger";

export const maxDuration = 60;

// Backstop drainer. Every tick it finishes any send that a killed serverless
// invocation left with un-sent (pending/queued) or stalled recipients — so a
// large send can never be permanently stuck even if the inline after()
// processing and the worker self-retrigger both die. Each send is processed with
// a bounded number of chunks so one tick can cover several sends; anything still
// remaining re-triggers the worker and/or is picked up on the next tick.
// Bounded so one tick stays comfortably under the 60s function limit even with
// full Maily rendering (3 sends x 2 chunks x 25 = 150 emails max). Overlapping
// ticks are safe: claim_queued_email_recipients uses FOR UPDATE SKIP LOCKED, so
// two concurrent drains never claim the same recipient.
const SENDS_PER_TICK = 3;
const CHUNKS_PER_SEND = 2;

export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const sendIds = await getEmailSendsNeedingProcessing(SENDS_PER_TICK);
  if (sendIds.length === 0) {
    return Response.json({ ok: true, sends: [] });
  }

  const provider = getEmailProvider();
  const sends: Array<{ sendId: string; processed: number; hasMore: boolean }> =
    [];
  for (const sendId of sendIds) {
    const result = await processEmailSendChunks({
      sendId,
      provider,
      maxChunks: CHUNKS_PER_SEND,
    });
    sends.push({ sendId, ...result });
    if (result.hasMore) {
      after(async () => {
        // Best-effort fast path; the next cron tick is the guaranteed backstop.
        await triggerEmailWorker(sendId).catch(() => {});
      });
    }
  }

  return Response.json({ ok: true, sends });
}
