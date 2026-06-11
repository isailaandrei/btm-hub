import { revalidatePath } from "next/cache";

import { ACADEMY_IMPORT_SOURCES } from "@/lib/academy/import";
import {
  runAcademySheetsImport,
  type AcademySheetsImportSummary,
} from "@/lib/academy/import-service";

export type AcademyImportRunResult = {
  summary: AcademySheetsImportSummary;
  memorySync: null;
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

  return {
    summary,
    memorySync: null,
  };
}
