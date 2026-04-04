import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Supabase Database Webhook endpoint.
 * Called when forum_threads or forum_posts are inserted/updated/deleted.
 * Revalidates the community feed and the affected thread page.
 *
 * Setup: In Supabase Dashboard → Database → Webhooks, create webhooks for:
 *   - Table: forum_threads, Events: INSERT, UPDATE, DELETE
 *   - Table: forum_posts, Events: INSERT, UPDATE, DELETE
 *   - URL: https://your-domain.com/api/community/revalidate
 *   - Headers: { "x-webhook-secret": "<COMMUNITY_WEBHOOK_SECRET>" }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.COMMUNITY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing COMMUNITY_WEBHOOK_SECRET" }, { status: 500 });
  }

  const headerSecret = req.headers.get("x-webhook-secret");
  if (headerSecret !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let body: { type: string; table: string; record?: Record<string, unknown>; old_record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Always revalidate the community feed
  revalidatePath("/community");

  // If we can determine the thread slug, revalidate that specific page too
  const record = body.record ?? body.old_record;
  if (record) {
    // forum_threads have a slug directly
    if (body.table === "forum_threads" && typeof record.slug === "string") {
      revalidatePath(`/community/${record.slug}`);
    }
    // forum_posts have a thread_id — we can't easily get the slug without a DB query,
    // but revalidating /community is sufficient since thread pages use cache() per-request
  }

  return NextResponse.json({ revalidated: true, table: body.table, type: body.type });
}
