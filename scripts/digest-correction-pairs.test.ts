/**
 * Digest-correction calibration export — a gated, READ-ONLY live-DB report of
 * every admin label correction (original -> corrected + the digest's summary
 * text) for tuning the digest taxonomy prompt against real mistakes. After a
 * prompt revision, run a recalibration wipe (runbook §Recalibration wipe) —
 * corrections persist across the wipe because they are keyed by content hash.
 * Do NOT bump DIGEST_GENERATOR_VERSION for prompt-only changes: the version is
 * an input to buildDigestContentHash, so bumping it re-keys every window and
 * ORPHANS all corrections. Bump it only when window membership itself changes
 * (e.g. a windowing-rule change), where re-keying is unavoidable anyway.
 *
 * Run:
 *   RUN_DIGEST_CORRECTION_PAIRS=1 npx vitest run scripts/digest-correction-pairs.test.ts
 *
 * Gated behind RUN_DIGEST_CORRECTION_PAIRS so the normal suite never runs it.
 * Reads the service-role DB from `.env.development.local`. NO writes.
 */
import { describe, expect, it } from "vitest";
import {
  createLiveSupabaseClient,
  loadEnv,
} from "./admin-ai-live-lib";

const gateEnabled = process.env.RUN_DIGEST_CORRECTION_PAIRS === "1";

type CorrectionRow = {
  content_hash: string;
  // Label-pair fields are null on a label-less correction (summary/event-date/
  // dismissal only) — those are NOT calibration pairs and are filtered out below.
  corrected_relevance: "profile" | "status" | null;
  corrected_is_noise: boolean | null;
  corrected_summary: string | null;
  corrected_event_date: string | null;
  original_relevance: "profile" | "status" | null;
  original_is_noise: boolean | null;
  corrected_by: string | null;
  dismissed_at: string | null;
  created_at: string;
};

type DigestRow = {
  content_hash: string;
  contact_id: string;
  window_start: string;
  window_end: string;
  summary: string;
  generator_version: string;
};

function labelOf(isNoise: boolean | null, relevance: string | null): string {
  if (isNoise === null) return "(no label)";
  return isNoise ? "noise" : (relevance ?? "(unlabeled)");
}

describe.runIf(gateEnabled)("digest correction pairs", () => {
  const env: Record<string, string> = (() => {
    try {
      return loadEnv(".env.development.local");
    } catch {
      return {};
    }
  })();

  it("prints original -> corrected label pairs with digest summaries", async () => {
    const supabase = createLiveSupabaseClient(env);

    const { data: corrections, error: correctionsError } = await supabase
      .from("conversation_digest_corrections")
      .select(
        "content_hash, corrected_relevance, corrected_is_noise, corrected_summary, corrected_event_date, original_relevance, original_is_noise, corrected_by, dismissed_at, created_at",
      )
      .order("created_at", { ascending: true });
    if (correctionsError) throw new Error(correctionsError.message);

    const allRows = (corrections ?? []) as CorrectionRow[];
    // Only rows carrying a LABEL correction are calibration pairs. Label-less
    // corrections (summary/event-date/dismissal overlays) have no original ->
    // corrected label to learn from; report their count and move on.
    const rows = allRows.filter(
      (row): row is CorrectionRow & { corrected_is_noise: boolean } =>
        row.corrected_is_noise !== null,
    );
    const labelLessCount = allRows.length - rows.length;
    const dismissedCount = allRows.filter(
      (row) => row.dismissed_at !== null,
    ).length;
    if (labelLessCount > 0 || dismissedCount > 0) {
      console.log(
        `(${labelLessCount} label-less correction(s), ${dismissedCount} dismissal(s) — not calibration pairs)`,
      );
    }
    if (rows.length === 0) {
      console.log("No digest label corrections recorded yet.");
      return;
    }

    // Look up summaries from the BASE table (not the effective view): the
    // taxonomy-tuning report needs the model's original context regardless of
    // the correction overlay. A hash can legitimately be missing right after
    // a recalibration wipe (before re-digestion) — report it, don't fail.
    const hashes = rows.map((row) => row.content_hash);
    const { data: digests, error: digestsError } = await supabase
      .from("conversation_digests")
      .select(
        "content_hash, contact_id, window_start, window_end, summary, generator_version",
      )
      .in("content_hash", hashes);
    if (digestsError) throw new Error(digestsError.message);

    const digestByHash = new Map(
      ((digests ?? []) as DigestRow[]).map((row) => [row.content_hash, row]),
    );

    console.log(`\n${rows.length} digest correction(s):\n`);
    for (const correction of rows) {
      const original = labelOf(
        correction.original_is_noise,
        correction.original_relevance,
      );
      const corrected = labelOf(
        correction.corrected_is_noise,
        correction.corrected_relevance,
      );
      const digest = digestByHash.get(correction.content_hash);
      console.log(`- ${original} -> ${corrected}`);
      console.log(`  hash: ${correction.content_hash}`);
      console.log(
        `  corrected: ${correction.created_at} by ${correction.corrected_by ?? "(deleted admin)"}`,
      );
      if (correction.corrected_summary) {
        console.log(`  human summary: ${correction.corrected_summary}`);
      }
      if (correction.corrected_event_date) {
        console.log(`  human event date: ${correction.corrected_event_date}`);
      }
      if (digest) {
        console.log(
          `  contact: ${digest.contact_id} · window ${digest.window_start} – ${digest.window_end} · generator ${digest.generator_version}`,
        );
        console.log(`  summary: ${digest.summary || "(empty — noise marker)"}`);
      } else {
        console.log(
          "  (digest row not found — recalibration wipe in progress? correction reapplies once the window is re-digested)",
        );
      }
      console.log("");
    }

    expect(rows.length).toBeGreaterThan(0);
  });
});
