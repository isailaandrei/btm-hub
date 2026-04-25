"use server";

import { z } from "zod/v4";

import { executeAcademyImportRun } from "@/lib/academy/import-runner";
import type { AcademyImportRunResult } from "@/lib/academy/import-runner";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { AcademyImportActionState } from "./actions-state";

const importModeSchema = z.object({
  mode: z.enum(["dry-run", "sync"]),
});

function summaryHadFailures(
  summary: AcademyImportRunResult["summary"],
): boolean {
  return (
    summary.failedSources > 0 ||
    summary.failedRows > 0 ||
    summary.invalid > 0 ||
    summary.ambiguous > 0
  );
}

function buildActionMessage(
  mode: "dry-run" | "sync",
  summary: AcademyImportRunResult["summary"],
): string {
  const failed = summaryHadFailures(summary);
  const prefix =
    mode === "dry-run"
      ? failed
        ? "Preview ready (with issues)"
        : "Preview ready"
      : failed
        ? "Sync finished with errors"
        : "Success";
  const parts: string[] = [];
  if (summary.inserted > 0) {
    parts.push(
      `${summary.inserted} ${summary.inserted === 1 ? "row was" : "rows were"} added`,
    );
  }
  if (summary.backfilled > 0) {
    parts.push(
      `${summary.backfilled} ${summary.backfilled === 1 ? "application was" : "applications were"} updated`,
    );
  }
  if (summary.failedSources > 0) {
    parts.push(
      `${summary.failedSources} ${summary.failedSources === 1 ? "source" : "sources"} failed entirely`,
    );
  }
  const couldNotAdd =
    summary.failedRows + summary.invalid + summary.ambiguous;
  if (couldNotAdd > 0) {
    parts.push(
      `${couldNotAdd} ${couldNotAdd === 1 ? "row" : "rows"} could not be added`,
    );
  }
  if (summary.drifted > 0) {
    parts.push(`${summary.drifted} drifted (left unchanged)`);
  }
  if (parts.length === 0) {
    return `${prefix}. Nothing new${
      summary.duplicates > 0
        ? ` — ${summary.duplicates} ${summary.duplicates === 1 ? "row was" : "rows were"} already up to date`
        : ""
    }.`;
  }
  return `${prefix}. ${parts.join(", ")}.`;
}

export async function runAcademyImportAction(
  prevState: AcademyImportActionState,
  formData: FormData,
): Promise<AcademyImportActionState> {
  const parsed = importModeSchema.safeParse({
    mode: formData.get("mode") ?? "",
  });

  if (!parsed.success) {
    return {
      ...prevState,
      errors: parsed.error.flatten().fieldErrors,
      message: null,
      success: false,
    };
  }

  try {
    await requireAdmin();
    const result = await executeAcademyImportRun({
      dryRun: parsed.data.mode === "dry-run",
      // Don't make the admin wait for the AI memory rebuild — that's an
      // OpenAI-bound loop that can take 30s–2min for ~100 new contacts.
      // The import itself returns immediately; memory rebuilds in the
      // background via after().
      deferMemorySync: parsed.data.mode === "sync",
    });

    return {
      errors: null,
      message: buildActionMessage(parsed.data.mode, result.summary),
      // Treat any failure (whole-source or per-row) as a non-success so the
      // UI surfaces an error treatment instead of a green-on-success badge.
      success: !summaryHadFailures(result.summary),
      mode: parsed.data.mode,
      summary: result.summary,
      memorySync: result.memorySync,
    };
  } catch (error) {
    return {
      errors: null,
      message: error instanceof Error ? error.message : String(error),
      success: false,
      mode: parsed.data.mode,
      summary: null,
      memorySync: null,
    };
  }
}
