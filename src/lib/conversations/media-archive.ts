/**
 * WhatsApp media archiver — copies attachment bytes out of YCloud into the
 * private `whatsapp-media` Storage bucket before YCloud's 30-day retention
 * expires them.
 *
 * The work queue is the `conversation_media` table (one row per attachment,
 * seeded from conversation_messages.media_json by the
 * `seed_conversation_media_queue` RPC). Each run seeds new rows, then
 * processes a BOUNDED batch of pending rows oldest-message-first (closest to
 * the expiry cliff), and reports what remains — the same drain-across-
 * schedules shape as the digest cron.
 *
 * Terminal states are deliberate and loud:
 *   stored  — bytes are ours; the media proxy serves them via signed URL.
 *   expired — upstream said 404/403/410: the media was gone before we got to
 *             it. Permanent; never retried; surfaced (not hidden) in the UI.
 *   failed  — MEDIA_MAX_ATTEMPTS transient failures or an oversize file; kept
 *             visible for manual review rather than silently dropped.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
export const DEFAULT_MAX_MEDIA_PER_RUN = 40;
export const MEDIA_FETCH_TIMEOUT_MS = 15_000;
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_MAX_ATTEMPTS = 5;
// Same SSRF guard as the media proxy route: we only ever fetch URLs we stored
// ourselves, and they must be YCloud media-download links.
export const YCLOUD_MEDIA_HOST = "api.ycloud.com";
// Fetch a few rows above the cap in one query so FETCH_CONCURRENCY chunking
// never needs a second round-trip.
const FETCH_CONCURRENCY = 4;

// WhatsApp's practical attachment types. Voice notes arrive as
// "audio/ogg; codecs=opus" — the mime is normalized before lookup.
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "audio/ogg": ".ogg",
  "audio/opus": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/amr": ".amr",
  "application/pdf": ".pdf",
};

export function normalizeContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const bare = contentType.split(";")[0]?.trim().toLowerCase();
  return bare && bare.length > 0 ? bare : null;
}

export function extensionForContentType(contentType: string | null): string {
  const mime = normalizeContentType(contentType);
  return (mime && EXTENSION_BY_MIME[mime]) ?? "";
}

export function storagePathFor(
  messageId: string,
  mediaIndex: number,
  contentType: string | null,
): string {
  return `messages/${messageId}/${mediaIndex}${extensionForContentType(contentType)}`;
}

export interface MediaFailureUpdate {
  status: "pending" | "expired" | "failed";
  attempts: number;
  lastError: string;
}

/**
 * State transition after a failed archive attempt. 404/403/410 means the
 * upstream copy is gone — permanent, regardless of attempt count. Everything
 * else is retriable until MEDIA_MAX_ATTEMPTS, then parked as failed.
 */
export function nextStateAfterFailure(input: {
  httpStatus: number | null;
  attempts: number;
  message: string;
}): MediaFailureUpdate {
  const attempts = input.attempts + 1;
  if (
    input.httpStatus === 404 ||
    input.httpStatus === 403 ||
    input.httpStatus === 410
  ) {
    return {
      status: "expired",
      attempts,
      lastError: `Upstream ${input.httpStatus}: media expired before archiving`,
    };
  }
  return {
    status: attempts >= MEDIA_MAX_ATTEMPTS ? "failed" : "pending",
    attempts,
    lastError: input.message,
  };
}

export interface MediaArchiveSummary {
  seeded: number;
  processed: number;
  stored: number;
  expired: number;
  failed: number;
  retriable: number;
  remaining: number;
}

interface PendingMediaRow {
  id: string;
  message_id: string;
  media_index: number;
  source_url: string;
  content_type: string | null;
  attempts: number;
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

async function archiveOne(
  supabase: AdminClient,
  apiKey: string,
  row: PendingMediaRow,
): Promise<"stored" | "expired" | "failed" | "retriable"> {
  const fail = async (httpStatus: number | null, message: string) => {
    const next = nextStateAfterFailure({
      httpStatus,
      attempts: row.attempts,
      message,
    });
    const { error } = await supabase
      .from("conversation_media")
      .update({
        status: next.status,
        attempts: next.attempts,
        last_error: next.lastError,
      })
      .eq("id", row.id);
    if (error) {
      throw new Error(
        `Failed to record media archive failure for ${row.id}: ${error.message}`,
      );
    }
    if (next.status === "expired") return "expired" as const;
    return next.status === "failed" ? ("failed" as const) : ("retriable" as const);
  };

  let parsed: URL;
  try {
    parsed = new URL(row.source_url);
  } catch {
    return fail(null, `Invalid source URL`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== YCLOUD_MEDIA_HOST) {
    // Not retriable-by-time and not an upstream expiry: park it for review.
    return fail(null, `Unsupported media host: ${parsed.hostname}`);
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    return fail(null, `Fetch failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    return fail(response.status, `Upstream HTTP ${response.status}`);
  }

  const declaredLength = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MEDIA_MAX_BYTES) {
    return fail(null, `Media too large: ${declaredLength} bytes`);
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    return fail(null, `Body read failed: ${(error as Error).message}`);
  }
  if (bytes.byteLength > MEDIA_MAX_BYTES) {
    return fail(null, `Media too large: ${bytes.byteLength} bytes`);
  }

  const contentType =
    normalizeContentType(row.content_type) ??
    normalizeContentType(response.headers.get("content-type")) ??
    "application/octet-stream";
  const storagePath = storagePathFor(row.message_id, row.media_index, contentType);

  const { error: uploadError } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (uploadError) {
    return fail(null, `Storage upload failed: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from("conversation_media")
    .update({
      status: "stored",
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: bytes.byteLength,
      attempts: row.attempts + 1,
      last_error: null,
      fetched_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updateError) {
    // Bytes are uploaded but the ledger doesn't know — throw so the run is
    // visibly broken rather than silently double-counting next time (the
    // upsert:true upload makes the retry harmless).
    throw new Error(
      `Failed to mark media ${row.id} stored: ${updateError.message}`,
    );
  }
  return "stored";
}

/**
 * Seed the queue from media_json, then archive up to `maxItems` pending
 * attachments, oldest message first. Bounded by design — callers (cron,
 * backfill script) loop across runs until `remaining` hits 0.
 */
export async function archiveConversationMediaBatch(
  options: { maxItems?: number } = {},
): Promise<MediaArchiveSummary> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_MEDIA_PER_RUN;
  const apiKey = process.env.YCLOUD_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YCLOUD_API_KEY is not configured; cannot archive media");
  }

  const supabase = await createAdminClient();

  const { data: seededCount, error: seedError } = await supabase.rpc(
    "seed_conversation_media_queue",
  );
  if (seedError) {
    throw new Error(`Failed to seed media queue: ${seedError.message}`);
  }
  const seeded = typeof seededCount === "number" ? seededCount : 0;

  const { data: pendingData, error: pendingError } = await supabase
    .from("conversation_media")
    .select("id, message_id, media_index, source_url, content_type, attempts")
    .eq("status", "pending")
    .order("message_happened_at", { ascending: true })
    .limit(maxItems);
  if (pendingError) {
    throw new Error(`Failed to list pending media: ${pendingError.message}`);
  }
  const pending = (pendingData ?? []) as unknown as PendingMediaRow[];

  const summary: MediaArchiveSummary = {
    seeded,
    processed: pending.length,
    stored: 0,
    expired: 0,
    failed: 0,
    retriable: 0,
    remaining: 0,
  };

  for (let i = 0; i < pending.length; i += FETCH_CONCURRENCY) {
    const chunk = pending.slice(i, i + FETCH_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map((row) => archiveOne(supabase, apiKey, row)),
    );
    for (const outcome of outcomes) {
      if (outcome === "stored") summary.stored += 1;
      else if (outcome === "expired") summary.expired += 1;
      else if (outcome === "failed") summary.failed += 1;
      else summary.retriable += 1;
    }
  }

  const { count, error: countError } = await supabase
    .from("conversation_media")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (countError) {
    throw new Error(`Failed to count remaining media: ${countError.message}`);
  }
  summary.remaining = count ?? 0;

  return summary;
}
