import { NextResponse } from "next/server";
import { unsubscribeNewsletterByToken } from "@/lib/data/email-sends";

/**
 * RFC-8058 one-click unsubscribe endpoint. Mail clients (Gmail, Yahoo) POST here
 * with `List-Unsubscribe=One-Click` and expect the unsubscribe to complete with
 * no further interaction. We always return 200 so a valid-looking token doesn't
 * reveal whether it exists; the work is idempotent.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (token?.trim()) {
    await unsubscribeNewsletterByToken(token.trim());
  }
  return NextResponse.json({ ok: true });
}
