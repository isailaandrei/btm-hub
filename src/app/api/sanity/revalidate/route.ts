import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { parseBody } from "next-sanity/webhook";

interface WebhookPayload {
  _type: string;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) {
    return new Response("Missing SANITY_REVALIDATE_SECRET", { status: 500 });
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
