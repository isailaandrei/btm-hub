import { getEmailWorkerOrigin, getEmailWorkerSecret } from "./settings";

// Bound the app→self worker trigger so a hung self-call can't hold the caller
// (e.g. the drain cron) open. See the CLAUDE.md storm-proofing invariant.
const WORKER_TRIGGER_TIMEOUT_MS = 10000;

export async function triggerEmailWorker(sendId: string): Promise<boolean> {
  const secret = getEmailWorkerSecret();
  if (!secret) return false;

  try {
    const response = await fetch(
      `${getEmailWorkerOrigin()}/api/admin/email/process`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-email-worker-secret": secret,
        },
        body: JSON.stringify({ sendId }),
        signal: AbortSignal.timeout(WORKER_TRIGGER_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`Email worker trigger failed with ${response.status}`);
    }
    return true;
  } catch (error) {
    // Logged loudly here (never swallowed) because some callers fire-and-forget
    // — the drain cron does `triggerEmailWorker(id).catch(() => {})` — and would
    // otherwise lose the failure entirely. The drain backstop re-triggers stuck
    // sends on its next tick, so the throw stays fatal only for callers that await.
    console.error(
      `[email-worker-trigger] Failed to trigger worker for send ${sendId}:`,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
