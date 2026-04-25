import { revalidatePath } from "next/cache";

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

  const memorySync =
    summary.insertedContactIds.length > 0
      ? await syncContactMemoryBulk(summary.insertedContactIds, {
          concurrency: 8,
        })
      : null;

  return {
    summary,
    memorySync,
  };
}
