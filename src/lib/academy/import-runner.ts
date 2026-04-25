import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { ACADEMY_IMPORT_SOURCES } from "@/lib/academy/import";
import {
  runAcademySheetsImport,
  type AcademySheetsImportSummary,
} from "@/lib/academy/import-service";
import { syncContactMemoryBulk } from "@/lib/admin-ai-memory/server-action-sync";

export type AcademyImportRunResult = {
  summary: AcademySheetsImportSummary;
  memorySync: Awaited<ReturnType<typeof syncContactMemoryBulk>> | null;
};

export async function executeAcademyImportRun(options: {
  dryRun?: boolean;
  /**
   * When true, the AI-memory rebuild for newly inserted contacts is
   * scheduled via `next/server`'s `after()` so it runs after the response
   * is sent. The action returns with `memorySync: null` and the work
   * completes in the background. Use for the admin UI path where blocking
   * the operator on per-contact LLM/embedding calls is unnecessary.
   *
   * When false (default), memory sync is awaited inline and its result is
   * returned, so callers like the cron route can surface failures in their
   * status code.
   */
  deferMemorySync?: boolean;
} = {}): Promise<AcademyImportRunResult> {
  const summary = await runAcademySheetsImport(ACADEMY_IMPORT_SOURCES, {
    dryRun: options.dryRun,
  });

  if (summary.dryRun || summary.inserted === 0) {
    return {
      summary,
      memorySync: null,
    };
  }

  revalidatePath("/admin");
  for (const contactId of summary.insertedContactIds) {
    revalidatePath(`/admin/contacts/${contactId}`);
  }

  if (summary.insertedContactIds.length === 0) {
    return { summary, memorySync: null };
  }

  if (options.deferMemorySync) {
    const contactIds = [...summary.insertedContactIds];
    after(async () => {
      try {
        await syncContactMemoryBulk(contactIds, { concurrency: 8 });
      } catch (error) {
        console.error("[academy-import] deferred memory sync failed", {
          contactIdCount: contactIds.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return { summary, memorySync: null };
  }

  const memorySync = await syncContactMemoryBulk(summary.insertedContactIds, {
    concurrency: 8,
  });

  return {
    summary,
    memorySync,
  };
}
