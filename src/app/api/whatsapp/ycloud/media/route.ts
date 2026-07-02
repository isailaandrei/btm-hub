import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import { getConversationMessageMediaUrl } from "@/lib/data/conversations";

// YCloud media-download links are only directly fetchable for a few minutes;
// after that they require the account API key, so the browser can't load them
// in an <img>. This admin-gated proxy fetches them server-side with the key and
// streams the bytes back. We only ever proxy YCloud media-download URLs we
// stored ourselves (looked up by message id), which avoids open-proxy/SSRF.
const YCLOUD_MEDIA_HOST = "api.ycloud.com";
// Bound only the initial request (connect + response headers). We deliberately
// do NOT bound the streamed body — see the fetch below.
const YCLOUD_MEDIA_FETCH_TIMEOUT_MS = 15000;

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get("messageId") ?? "";
  const index = Number.parseInt(searchParams.get("index") ?? "", 10);

  try {
    validateUUID(messageId);
  } catch {
    return NextResponse.json({ error: "Invalid messageId" }, { status: 400 });
  }
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  const apiKey = process.env.YCLOUD_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Media proxy not configured (YCLOUD_API_KEY missing)" },
      { status: 503 },
    );
  }

  const mediaUrl = await getConversationMessageMediaUrl(messageId, index);
  if (!mediaUrl) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== YCLOUD_MEDIA_HOST) {
    return NextResponse.json({ error: "Unsupported media URL" }, { status: 400 });
  }

  // Bound the initial fetch (connect + headers) so a hung YCloud endpoint can't
  // hold this request open, but clear the timer the moment headers arrive so
  // streaming the (possibly large) media body to the client is never cut off.
  const controller = new AbortController();
  const headersTimeout = setTimeout(
    () => controller.abort(),
    YCLOUD_MEDIA_FETCH_TIMEOUT_MS,
  );
  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    });
  } catch {
    return NextResponse.json(
      { error: "Media unavailable upstream (fetch timed out)" },
      { status: 504 },
    );
  } finally {
    clearTimeout(headersTimeout);
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Media unavailable upstream", status: upstream.status },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      // Media bytes are immutable; let the browser cache them privately.
      "cache-control": "private, max-age=86400",
    },
  });
}
