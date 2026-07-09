/**
 * Contact AI-summary backfill — generates the initial per-contact summaries by
 * looping the SAME bounded batch function the nightly cron uses.
 *
 * Preview what WOULD be generated (hash check only — no model calls, no writes):
 *   RUN_CONTACT_AI_SUMMARIES=1 SUMMARIES_DRY_RUN=1 \
 *     npx vitest run scripts/contact-ai-summaries-backfill.test.ts
 *
 * Generate (model calls + DB writes; after auditing the dry run):
 *   RUN_CONTACT_AI_SUMMARIES=1 \
 *     npx vitest run scripts/contact-ai-summaries-backfill.test.ts
 *
 * Gated behind RUN_CONTACT_AI_SUMMARIES so the normal suite never runs it.
 * Reads env from `.env.development.local` (service-role DB + the resolved
 * ADMIN_AI_PROVIDER for generation). Initial pass over ~300 contacts costs
 * roughly $0.5–1 cold on DeepSeek.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "./admin-ai-live-lib";
import {
  buildContactCardHash,
  processContactAiSummaries,
  type ContactSummarySummaryRun,
} from "@/lib/admin-ai/contact-summary";
import { renderContactCard } from "@/lib/admin-ai/contact-card";
import { EvidenceAliasRegistry } from "@/lib/admin-ai/evidence-alias";
import { listContactAiSummaryHashes } from "@/lib/data/contact-ai-summaries";
import { loadEligibleContactCardRecords } from "@/lib/data/contact-cards";

const gateEnabled = process.env.RUN_CONTACT_AI_SUMMARIES === "1";
const dryRun = process.env.SUMMARIES_DRY_RUN === "1";

// Hard stop so a mis-computed `remaining` can never loop forever.
const MAX_ITERATIONS = 100;

// Same env-overwrite dance as the digest backlog: the data layer builds the
// admin client from process.env, which Vitest's global setup points at a
// not-running local stack — OVERWRITE (plain assignment) from
// .env.development.local, restore after.
const OVERRIDE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_AI_PROVIDER",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_BASE_URL",
] as const;

describe.runIf(gateEnabled)("contact AI summaries backfill", () => {
  // Guarded: describe.runIf still evaluates this callback at collection, so an
  // env-less checkout (CI, fresh clone) must not crash at import.
  const env: Record<string, string> = gateEnabled
    ? loadEnv(".env.development.local")
    : {};
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
    dryRun
      ? "reports stale/missing summaries (dry run)"
      : "generates all stale summaries",
    { timeout: 3_600_000 },
    async () => {
      if (dryRun) {
        const [records, storedHashes] = await Promise.all([
          loadEligibleContactCardRecords(),
          listContactAiSummaryHashes(),
        ]);
        const stale = records.filter((record) => {
          const card = renderContactCard(record, new EvidenceAliasRegistry());
          return (
            storedHashes.get(record.contact.id) !==
            buildContactCardHash(card.text)
          );
        });
        console.log(`Eligible contacts: ${records.length}`);
        console.log(`Stored summaries:  ${storedHashes.size}`);
        console.log(`Stale/missing:     ${stale.length}`);
        console.log(
          "Dry run only — re-run without SUMMARIES_DRY_RUN to generate.",
        );
        expect(stale.length).toBeGreaterThanOrEqual(0);
        return;
      }

      const runs: ContactSummarySummaryRun[] = [];
      let iterations = 0;
      let lastRemaining = Number.POSITIVE_INFINITY;
      for (;;) {
        iterations += 1;
        if (iterations > MAX_ITERATIONS) {
          throw new Error(`Exceeded ${MAX_ITERATIONS} iterations; aborting`);
        }
        const run = await processContactAiSummaries();
        runs.push(run);
        console.log(
          `Run ${iterations}: generated=${run.generated} failed=${run.failed}` +
            ` stale=${run.stale} remaining=${run.remaining}`,
        );
        if (run.remaining === 0) break;
        if (run.remaining >= lastRemaining && run.generated === 0) {
          throw new Error(
            `No progress (remaining ${run.remaining}); stopping — inspect the per-contact errors above`,
          );
        }
        lastRemaining = run.remaining;
      }

      const totals = runs.reduce(
        (acc, run) => ({
          generated: acc.generated + run.generated,
          failed: acc.failed + run.failed,
        }),
        { generated: 0, failed: 0 },
      );
      console.log(
        `TOTALS: generated=${totals.generated} failed=${totals.failed}`,
      );
      expect(runs.at(-1)?.remaining).toBe(0);
    },
  );
});
