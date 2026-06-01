import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileStaleCheckoutSessions } from "@/lib/shop/checkout-reconciliation";

export const maxDuration = 60;

function constantTimeAuthEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return { authorized: false, missingSecret: true };

  const authHeader = request.headers.get("authorization") ?? "";
  return {
    authorized: constantTimeAuthEqual(authHeader, `Bearer ${secret}`),
    missingSecret: false,
  };
}

export async function GET(request: Request) {
  const authorization = isAuthorizedCronRequest(request);
  if (authorization.missingSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }
  if (!authorization.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileStaleCheckoutSessions();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reconcile checkout sessions.",
      },
      { status: 500 },
    );
  }
}
