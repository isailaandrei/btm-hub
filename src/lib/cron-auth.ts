import { timingSafeEqual } from "node:crypto";

function constantTimeEqual(provided: string, expected: string): boolean {
  // Constant-time compare so the cron secret can't be probed byte-by-byte via
  // response timing. Differing lengths short-circuit to false.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Authorize a Vercel-cron-triggered request. Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` on scheduled invocations when the
 * CRON_SECRET env var is set. Returns an error Response when unauthorized or
 * unconfigured, or null when the request is authorized.
 */
export function authorizeCronRequest(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
