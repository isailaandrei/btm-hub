/**
 * Stage-progress channel for long-running admin-AI answers.
 *
 * The answer runs inside one awaited server action, so mid-run progress needs
 * an out-of-band channel that works across serverless instances: a tiny
 * `admin_ai_progress` row keyed by a client-generated id, polled by the
 * client every couple of seconds.
 *
 * HARD RULE (queue spec): progress must never affect the answer. Every write
 * is fire-and-forget — failures are logged, never thrown — and writes are
 * serialized through an internal promise chain so a slow write can't land
 * out of order over a newer one.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAiProgressStage = "planning" | "scanning" | "analyzing";

export interface AdminAiProgressEvent {
  stage: AdminAiProgressStage;
  /** Map chunks completed so far (scanning only). */
  chunksDone?: number;
  /** Total map chunks this run (scanning only). */
  chunkTotal?: number;
  /**
   * Contacts the scan examines — the whole corpus reaching the map (confirmed
   * + rescue pool). Surfaced in the UI so admins see that EVERY contact was
   * read; `candidateCount` is the subset the scan flagged, not coverage.
   */
  contactTotal?: number;
  /** Candidates flagged so far / being analyzed. */
  candidateCount?: number;
}

export interface AdminAiProgressSnapshot extends AdminAiProgressEvent {
  updatedAt: string;
}

export type AdminAiProgressCallback = (event: AdminAiProgressEvent) => void;

export interface AdminAiProgressReporter {
  /** Fire-and-forget: safe to call from anywhere in the pipeline. */
  report: AdminAiProgressCallback;
  /** Delete the row once the answer has resolved (also fire-and-forget-safe). */
  clear: () => Promise<void>;
}

export function createAdminAiProgressReporter(
  progressId: string,
): AdminAiProgressReporter {
  // Serializes writes; every link swallows its own error so the chain (and
  // the pipeline above it) can never reject.
  let chain: Promise<void> = Promise.resolve();

  const report: AdminAiProgressCallback = (event) => {
    chain = chain.then(async () => {
      try {
        const supabase = await createAdminClient();
        const { error } = await supabase.from("admin_ai_progress").upsert(
          [
            {
              id: progressId,
              snapshot: event,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "id" },
        );
        if (error) throw new Error(error.message);
      } catch (error) {
        console.warn(
          `[admin-ai] progress write failed (answer unaffected): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
  };

  const clear = async () => {
    await chain;
    try {
      const supabase = await createAdminClient();
      const { error } = await supabase
        .from("admin_ai_progress")
        .delete()
        .eq("id", progressId);
      if (error) throw new Error(error.message);
    } catch (error) {
      console.warn(
        `[admin-ai] progress cleanup failed (row will linger, harmless): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return { report, clear };
}

export async function readAdminAiProgress(
  progressId: string,
): Promise<AdminAiProgressSnapshot | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("admin_ai_progress")
    .select("snapshot, updated_at")
    .eq("id", progressId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read admin AI progress: ${error.message}`);
  }
  if (!data) return null;
  const row = data as { snapshot: AdminAiProgressEvent; updated_at: string };
  return { ...row.snapshot, updatedAt: row.updated_at };
}
