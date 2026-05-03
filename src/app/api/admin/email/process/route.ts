import { after, NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email/provider";
import { processEmailSendChunks } from "@/lib/email/send-pipeline";
import { getEmailWorkerSecret } from "@/lib/email/settings";
import { triggerEmailWorker } from "@/lib/email/worker-trigger";
import { validateUUID } from "@/lib/validation-helpers";

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = getEmailWorkerSecret();
  if (!secret) {
    return NextResponse.json({ error: "Email worker disabled" }, { status: 404 });
  }
  if (request.headers.get("x-email-worker-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const sendId = (body as Record<string, unknown>).sendId;
  if (typeof sendId !== "string") {
    return NextResponse.json({ error: "Missing sendId" }, { status: 400 });
  }
  validateUUID(sendId, "email send");

  const result = await processEmailSendChunks({
    sendId,
    provider: getEmailProvider(),
  });
  if (result.hasMore) {
    after(async () => {
      await triggerEmailWorker(sendId);
    });
  }
  return NextResponse.json(result);
}
