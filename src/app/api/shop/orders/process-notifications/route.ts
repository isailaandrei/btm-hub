import { NextResponse } from "next/server";
import { getEmailWorkerSecret } from "@/lib/email/settings";
import { sendPendingShopOrderNotifications } from "@/lib/shop/order-emails";

function isAuthorized(request: Request) {
  const secret = getEmailWorkerSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendPendingShopOrderNotifications();
  return NextResponse.json(result);
}
