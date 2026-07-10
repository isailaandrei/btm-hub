import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { parseBody } from "next-sanity/webhook";

interface WebhookPayload {
  _type: string;
}

// Provider-callback route: keep it storm-proof per the repo webhook rule —
// small explicit time bound, and never a 5xx (Sanity retries 5xx; a permanent
// misconfig would retry forever without ever succeeding).
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) {
    console.error(
      "[sanity-revalidate] SANITY_REVALIDATE_SECRET is not configured; acknowledging without revalidating",
    );
    return NextResponse.json(
      { revalidated: false, reason: "missing secret" },
      { status: 200 },
    );
  }

  const { isValidSignature, body } = await parseBody<WebhookPayload>(
    req,
    secret,
  );

  if (!isValidSignature) {
    return new Response(
      JSON.stringify({ message: "Invalid signature", isValidSignature }),
      { status: 401 },
    );
  }

  if (!body?._type) {
    return new Response(
      JSON.stringify({ message: "Bad Request", body }),
      { status: 400 },
    );
  }

  // Bust all Sanity-tagged cache entries. sanityFetch (from defineLive) tags entries
  // with "sanity" + opaque sync tags — not with document type names. This is the
  // recommended fallback for when no browser has <SanityLive /> mounted.
  // Primary revalidation happens via SanityLive's EventSource in the marketing layout.
  revalidateTag("sanity", "max");
  return NextResponse.json({ revalidated: true, type: body._type });
}
