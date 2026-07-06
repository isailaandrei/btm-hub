/**
 * Conversation-digest backlog drainer — a gated, live run that invokes the SAME
 * bounded processing function the daily cron uses, looping until the backlog is
 * empty.
 *
 * Preview what WOULD be processed (no model calls, no writes):
 *   RUN_CONVERSATION_DIGEST_BACKLOG=1 BACKLOG_DRY_RUN=1 \
 *     npx vitest run scripts/conversation-digest-backlog.test.ts
 *
 * Drain the backlog (model calls + DB writes; after auditing the dry run):
 *   RUN_CONVERSATION_DIGEST_BACKLOG=1 \
 *     npx vitest run scripts/conversation-digest-backlog.test.ts
 *
 * Gated behind RUN_CONVERSATION_DIGEST_BACKLOG so the normal suite never runs
 * it. Reads env from `.env.development.local` (service-role DB + the resolved
 * ADMIN_AI_PROVIDER for extraction).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "./admin-ai-live-lib";
import {
  DEFAULT_MAX_DIGEST_WINDOWS_PER_RUN,
  isTriviallyNoisyWindow,
  processConversationDigestWindows,
  splitMessagesIntoDigestWindows,
  type ConversationDigestProcessSummary,
} from "@/lib/conversations/digests";
import { listUndigestedConversationMessages } from "@/lib/data/conversations";

const gateEnabled = process.env.RUN_CONVERSATION_DIGEST_BACKLOG === "1";
const dryRun = process.env.BACKLOG_DRY_RUN === "1";

// Hard stop so a mis-computed remainingWindows can never loop forever.
const MAX_ITERATIONS = 1000;

// This script drives the cron's shared processing path, whose data layer builds
// the ADMIN client from process.env (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY) at each call. Vitest's global setup pre-sets
// NEXT_PUBLIC_SUPABASE_URL to a not-running local stack, so these MUST be
// OVERWRITTEN (plain assignment) from .env.development.local — a guarded/`??=`
// assign would leave the admin client pointed at localhost. Drain mode also
// needs the provider env for extraction. Saved/restored around the run.
const OVERRIDE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_AI_PROVIDER",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_BASE_URL",
  // Embeddings always run on OpenAI regardless of ADMIN_AI_PROVIDER (DeepSeek has
  // no embedding endpoint); embeddings.ts reads only OPENAI_API_KEY.
  "OPENAI_API_KEY",
] as const;

describe.runIf(gateEnabled)("conversation digest backlog", () => {
  const env: Record<string, string> = (() => {
    try {
      return loadEnv(".env.development.local");
    } catch {
      return {};
    }
  })();
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of OVERRIDE_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      if (env[key] !== undefined) process.env[key] = env[key];
    }
  });

  afterAll(() => {
    for (const key of OVERRIDE_ENV_KEYS) {
      const original = savedEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it(
    dryRun ? "previews the windows it would process" : "drains the digest backlog",
    async () => {
      if (dryRun) {
        const messages = await listUndigestedConversationMessages({ limit: 10000 });
        const windows = splitMessagesIntoDigestWindows(messages, Date.now());
        const byContact = new Map<
          string,
          { total: number; noise: number; signal: number }
        >();
        for (const { window, messages: windowMessages } of windows) {
          const bucket = byContact.get(window.contactId) ?? {
            total: 0,
            noise: 0,
            signal: 0,
          };
          bucket.total += 1;
          if (isTriviallyNoisyWindow(windowMessages)) bucket.noise += 1;
          else bucket.signal += 1;
          byContact.set(window.contactId, bucket);
        }
        const rows = [...byContact.entries()].sort(
          (a, b) => b[1].total - a[1].total,
        );
        const totalNoise = rows.reduce((n, [, v]) => n + v.noise, 0);
        const lines = [
          "=".repeat(80),
          "CONVERSATION DIGEST BACKLOG · DRY RUN (no model calls, no writes)",
          "=".repeat(80),
          `Undigested inbound messages: ${messages.length}`,
          `Quiesced windows that WOULD process: ${windows.length} (${totalNoise} code-level noise)`,
          `Contacts with backlog: ${rows.length}`,
          "-".repeat(80),
          ...rows
            .slice(0, 60)
            .map(
              ([contactId, v]) =>
                `${contactId}  windows=${v.total}  signal=${v.signal}  noise=${v.noise}`,
            ),
          "=".repeat(80),
        ];
        console.info(`\n${lines.join("\n")}\n`);
        expect(windows.length).toBeGreaterThanOrEqual(0);
        return;
      }

      const totals: ConversationDigestProcessSummary = {
        processedWindows: 0,
        digestsCreated: 0,
        factsCreated: 0,
        embeddingsCreated: 0,
        noiseWindows: 0,
        remainingWindows: 0,
      };
      let iterations = 0;
      let remaining = Number.POSITIVE_INFINITY;

      while (remaining > 0 && iterations < MAX_ITERATIONS) {
        const summary = await processConversationDigestWindows({
          maxWindows: DEFAULT_MAX_DIGEST_WINDOWS_PER_RUN,
        });
        iterations += 1;
        totals.processedWindows += summary.processedWindows;
        totals.digestsCreated += summary.digestsCreated;
        totals.factsCreated += summary.factsCreated;
        totals.embeddingsCreated += summary.embeddingsCreated;
        totals.noiseWindows += summary.noiseWindows;
        remaining = summary.remainingWindows;
        // No-progress guard: if a run neither processed a window nor embedded a
        // message, there is nothing actionable right now (e.g. only live
        // sessions remain) — stop rather than spin.
        if (
          summary.processedWindows === 0 &&
          summary.embeddingsCreated === 0
        ) {
          break;
        }
      }
      totals.remainingWindows = remaining;

      const lines = [
        "=".repeat(80),
        "CONVERSATION DIGEST BACKLOG · DRAIN COMPLETE",
        "=".repeat(80),
        `Iterations: ${iterations}`,
        `Windows processed: ${totals.processedWindows}`,
        `Signal digests created: ${totals.digestsCreated}`,
        `Facts created: ${totals.factsCreated}`,
        `Noise windows: ${totals.noiseWindows}`,
        `Embeddings created: ${totals.embeddingsCreated}`,
        `Remaining windows: ${totals.remainingWindows}`,
        "=".repeat(80),
      ];
      console.info(`\n${lines.join("\n")}\n`);

      expect(totals.remainingWindows).toBe(0);
    },
    3_600_000,
  );
});
