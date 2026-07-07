/**
 * WhatsApp media backfill — archives every existing attachment out of YCloud
 * (30-day retention!) into the private `whatsapp-media` Storage bucket, by
 * looping the SAME bounded batch function the daily cron uses.
 *
 * Preview what WOULD be archived (no fetches, no writes):
 *   RUN_WHATSAPP_MEDIA_BACKFILL=1 \
 *     npx vitest run scripts/whatsapp-media-backfill.test.ts
 *
 * Archive (YCloud fetches + Storage uploads + ledger writes; after auditing
 * the dry run):
 *   RUN_WHATSAPP_MEDIA_BACKFILL=1 BACKFILL_APPLY=1 \
 *     npx vitest run scripts/whatsapp-media-backfill.test.ts
 *
 * Gated behind RUN_WHATSAPP_MEDIA_BACKFILL so the normal suite never runs it.
 * Reads env from `.env.development.local` (service-role DB + YCLOUD_API_KEY).
 * Expect some `expired` rows: history-synced messages can be older than
 * YCloud's retention window — those are reported, not hidden.
 */
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLiveSupabaseClient, loadEnv } from "./admin-ai-live-lib";
import {
  archiveConversationMediaBatch,
  type MediaArchiveSummary,
} from "@/lib/conversations/media-archive";

const gateEnabled = process.env.RUN_WHATSAPP_MEDIA_BACKFILL === "1";
const apply = process.env.BACKFILL_APPLY === "1";

// Hard stop so a mis-computed `remaining` can never loop forever.
const MAX_ITERATIONS = 200;

// The archiver builds the ADMIN client from process.env at each call, and
// Vitest's global setup pre-sets NEXT_PUBLIC_SUPABASE_URL to a not-running
// local stack — so these MUST be OVERWRITTEN (plain assignment, not ??=) from
// .env.development.local. Saved/restored around the run.
const OVERRIDE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "YCLOUD_API_KEY",
] as const;

describe.runIf(gateEnabled)("whatsapp media backfill", () => {
  const env: Record<string, string> = loadEnv(".env.development.local");
  const savedEnv: Partial<Record<(typeof OVERRIDE_ENV_KEYS)[number], string>> =
    {};

  beforeAll(() => {
    for (const key of OVERRIDE_ENV_KEYS) {
      const value = env[key];
      if (!value) {
        throw new Error(`.env.development.local is missing ${key}`);
      }
      const current = process.env[key];
      if (current !== undefined) savedEnv[key] = current;
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const key of OVERRIDE_ENV_KEYS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
  });

  it(
    apply ? "archives the media backlog" : "reports the media backlog (dry run)",
    { timeout: 3_600_000 },
    async () => {
      const supabase = createLiveSupabaseClient(env);

      // Inventory straight from the source of truth. media_json is small and
      // the corpus is a few hundred messages, so filtering in JS beats
      // fighting PostgREST jsonb operators.
      const { data: messageData, error: messageError } = await supabase
        .from("conversation_messages")
        .select("id, media_json, happened_at");
      if (messageError) {
        throw new Error(`Failed to list messages: ${messageError.message}`);
      }
      const withMedia = (messageData ?? [])
        .map((row) => {
          const media = Array.isArray(row.media_json)
            ? (row.media_json as Array<{ url?: unknown; contentType?: unknown }>)
            : [];
          return { id: row.id, happenedAt: row.happened_at, media };
        })
        .filter((row) => row.media.length > 0);
      const totalAttachments = withMedia.reduce(
        (sum, row) => sum + row.media.length,
        0,
      );

      const byContentType = new Map<string, number>();
      for (const row of withMedia) {
        for (const item of row.media) {
          const key =
            typeof item.contentType === "string" && item.contentType
              ? item.contentType
              : "(unknown)";
          byContentType.set(key, (byContentType.get(key) ?? 0) + 1);
        }
      }

      const { data: ledger, error: ledgerError } = await supabase
        .from("conversation_media")
        .select("status");
      if (ledgerError) {
        throw new Error(`Failed to read media ledger: ${ledgerError.message}`);
      }
      const ledgerByStatus = new Map<string, number>();
      for (const row of ledger ?? []) {
        const status = String(row.status);
        ledgerByStatus.set(status, (ledgerByStatus.get(status) ?? 0) + 1);
      }

      console.log(`Messages with media:   ${withMedia.length}`);
      console.log(`Total attachments:     ${totalAttachments}`);
      console.log(
        `By contentType:        ${JSON.stringify(Object.fromEntries(byContentType))}`,
      );
      console.log(
        `Ledger by status:      ${JSON.stringify(Object.fromEntries(ledgerByStatus))}`,
      );

      if (!apply) {
        const oldest = withMedia.reduce<string | null>(
          (min, row) =>
            min === null || row.happenedAt < min ? row.happenedAt : min,
          null,
        );
        console.log(`Oldest media message:  ${oldest ?? "n/a"}`);
        console.log(
          "Dry run only — re-run with BACKFILL_APPLY=1 to archive. Attachments" +
            " older than YCloud's 30-day retention will come back as `expired`.",
        );
        expect(totalAttachments).toBeGreaterThanOrEqual(0);
        return;
      }

      const runs: MediaArchiveSummary[] = [];
      let iterations = 0;
      let lastRemaining = Number.POSITIVE_INFINITY;
      for (;;) {
        iterations += 1;
        if (iterations > MAX_ITERATIONS) {
          throw new Error(`Exceeded ${MAX_ITERATIONS} iterations; aborting`);
        }
        const summary = await archiveConversationMediaBatch();
        runs.push(summary);
        console.log(
          `Run ${iterations}: stored=${summary.stored} expired=${summary.expired}` +
            ` failed=${summary.failed} retriable=${summary.retriable}` +
            ` remaining=${summary.remaining}`,
        );
        if (summary.remaining === 0) break;
        // `retriable` rows stay pending, so remaining only shrinks when
        // progress is real. A full batch of retriable failures means YCloud
        // (or the network) is refusing us — stop instead of hammering.
        if (summary.remaining >= lastRemaining && summary.stored === 0) {
          throw new Error(
            `No progress (remaining ${summary.remaining}); stopping — inspect last_error on pending rows`,
          );
        }
        lastRemaining = summary.remaining;
      }

      const totals = runs.reduce(
        (acc, run) => ({
          stored: acc.stored + run.stored,
          expired: acc.expired + run.expired,
          failed: acc.failed + run.failed,
        }),
        { stored: 0, expired: 0, failed: 0 },
      );
      const report = {
        generatedAt: new Date().toISOString(),
        totalAttachments,
        byContentType: Object.fromEntries(byContentType),
        totals,
        runs,
      };
      const reportPath = `.admin-ai-debug/whatsapp-media-backfill-${Date.now()}.json`;
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`Report written to ${reportPath}`);
      console.log(
        `TOTALS: stored=${totals.stored} expired=${totals.expired} failed=${totals.failed}`,
      );

      expect(runs.at(-1)?.remaining).toBe(0);
    },
  );
});
