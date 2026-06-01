import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEmailWorkerSecret } from "@/lib/email/settings";
import { sendPendingShopOrderNotifications } from "@/lib/shop/order-emails";

export const maxDuration = 60;

function constantTimeAuthEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isAuthorizedBearer(request: Request, secret: string | null) {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return constantTimeAuthEqual(header, `Bearer ${secret}`);
}

async function processNotifications() {
  const result = await sendPendingShopOrderNotifications();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  if (!isAuthorizedBearer(request, process.env.CRON_SECRET?.trim() || null)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return processNotifications();
}

export async function POST(request: Request) {
  if (!isAuthorizedBearer(request, getEmailWorkerSecret())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return processNotifications();
}
