import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  getArchivedConversationMedia,
  getConversationMessageMediaUrl,
} from "@/lib/data/conversations";
import { WHATSAPP_MEDIA_BUCKET } from "@/lib/conversations/media-archive";
import { createAdminClient } from "@/lib/supabase/admin";

// YCloud media-download links are only directly fetchable for a few minutes;
// after that they require the account API key, and after 30 DAYS YCloud purges
// the media entirely. This admin-gated proxy therefore serves our own archived
// copy (private whatsapp-media bucket, via a short-lived signed URL) when one
// exists, and only falls back to fetching YCloud with the API key while the
// attachment is still pending archive. `expired` means YCloud purged it before
// we archived it — surfaced as an explicit 410, never a broken image.
// We only ever proxy YCloud media-download URLs we stored ourselves (looked up
// by message id), which avoids open-proxy/SSRF.
const YCLOUD_MEDIA_HOST = "api.ycloud.com";
const SIGNED_URL_TTL_SECONDS = 600;
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

  // Archived copy first: works even if YCloud (or its API key) is long gone.
  const archived = await getArchivedConversationMedia(messageId, index);
  if (archived?.status === "stored" && archived.storagePath) {
    const admin = await createAdminClient();
    const { data: signed, error: signError } = await admin.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(archived.storagePath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      // A stored row whose bytes can't be signed is a real fault — say so
      // instead of quietly re-proxying YCloud (which may already have purged).
      console.error(
        `whatsapp-media: failed to sign ${archived.storagePath}:`,
        signError?.message,
      );
      return NextResponse.json(
        { error: "Archived media unavailable (signing failed)" },
        { status: 502 },
      );
    }
    return NextResponse.redirect(signed.signedUrl, 302);
  }
  if (archived?.status === "expired") {
    return NextResponse.json(
      { error: "Media expired upstream before it was archived" },
      { status: 410 },
    );
  }

  // pending / failed / not-yet-seeded: fall back to the YCloud passthrough.
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
