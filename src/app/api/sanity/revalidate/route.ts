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

  revalidateTag(body._type, "max");
  return NextResponse.json({ revalidated: true, type: body._type });
}
