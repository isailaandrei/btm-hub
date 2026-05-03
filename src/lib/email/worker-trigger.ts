import { getEmailWorkerOrigin, getEmailWorkerSecret } from "./settings";

export async function triggerEmailWorker(sendId: string): Promise<boolean> {
  const secret = getEmailWorkerSecret();
  if (!secret) return false;

  const response = await fetch(`${getEmailWorkerOrigin()}/api/admin/email/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-email-worker-secret": secret,
    },
    body: JSON.stringify({ sendId }),
  });

  if (!response.ok) {
    throw new Error(`Email worker trigger failed with ${response.status}`);
  }
  return true;
}
