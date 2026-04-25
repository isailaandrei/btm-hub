import { getFormDefinition } from "@/lib/academy/forms";
import {
  type AcademyImportSource,
  buildAcademyImportContentHash,
  buildAcademyImportCsvUrl,
  buildAcademyImportSubmissionId,
  buildAcademyImportSourceId,
  parseAcademyImportCsv,
} from "@/lib/academy/import";
import {
  createImportedApplication,
  type ApplicationImportAmbiguousDetail,
  type ApplicationImportDriftDetail,
  type ApplicationImportInsertPreview,
} from "@/lib/data/application-imports";

export type {
  ApplicationImportAmbiguousDetail,
  ApplicationImportDriftDetail,
  ApplicationImportInsertPreview,
} from "@/lib/data/application-imports";

export type AcademySheetImportResult = {
  source: AcademyImportSource;
  scanned: number;
  inserted: number;
  backfilled: number;
  duplicates: number;
  drifted: number;
  ambiguous: number;
  invalid: number;
  failedRows: number;
  failed: boolean;
  errors: string[];
  insertedContactIds: string[];
  driftDetails: ApplicationImportDriftDetail[];
  insertPreviews: ApplicationImportInsertPreview[];
  ambiguousDetails: ApplicationImportAmbiguousDetail[];
};

export type AcademySheetsImportSummary = {
  dryRun: boolean;
  scanned: number;
  inserted: number;
  backfilled: number;
  duplicates: number;
  drifted: number;
  ambiguous: number;
  invalid: number;
  failedRows: number;
  failedSources: number;
  insertedContactIds: string[];
  sources: AcademySheetImportResult[];
};

function validateImportedAnswers(
  source: AcademyImportSource,
  answers: Record<string, unknown>,
): string[] {
  const formDefinition = getFormDefinition(source.program);
  if (!formDefinition) {
    return [`No form definition registered for ${source.program}`];
  }

  const email =
    typeof answers.email === "string" ? answers.email.trim().toLowerCase() : "";
  if (!email) {
    return ["email: Imported application is missing an email address"];
  }

  return [];
}

async function fetchAcademySheetCsv(source: AcademyImportSource): Promise<string> {
  const response = await fetch(buildAcademyImportCsvUrl(source), {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch CSV for ${source.label}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

export async function importAcademySheetSource(
  source: AcademyImportSource,
  options: { dryRun?: boolean } = {},
): Promise<AcademySheetImportResult> {
  const result: AcademySheetImportResult = {
    source,
    scanned: 0,
    inserted: 0,
    backfilled: 0,
    duplicates: 0,
    drifted: 0,
    ambiguous: 0,
    invalid: 0,
    failedRows: 0,
    failed: false,
    errors: [],
    insertedContactIds: [],
    driftDetails: [],
    insertPreviews: [],
    ambiguousDetails: [],
  };

  const csvText = await fetchAcademySheetCsv(source);
  const parsed = parseAcademyImportCsv(source.program, csvText);
  if (
    parsed.unknownHeaders.length > 0 ||
    parsed.missingHeaders.length > 0 ||
    parsed.duplicateHeaders.length > 0
  ) {
    result.failed = true;
    if (parsed.unknownHeaders.length > 0) {
      result.errors.push(`Unknown headers: ${parsed.unknownHeaders.join(", ")}`);
    }
    if (parsed.missingHeaders.length > 0) {
      result.errors.push(`Missing headers: ${parsed.missingHeaders.join(", ")}`);
    }
    if (parsed.duplicateHeaders.length > 0) {
      result.errors.push(`Duplicate headers: ${parsed.duplicateHeaders.join(", ")}`);
    }
    return result;
  }

  for (const row of parsed.rows) {
    result.scanned += 1;
    const importSource = buildAcademyImportSourceId(source);

    const validationErrors = validateImportedAnswers(source, row.answers);
    if (validationErrors.length > 0) {
      result.invalid += 1;
      result.errors.push(
        `Row ${row.sourceRowNumber}: ${validationErrors.join("; ")}`,
      );
      continue;
    }

    let persisted;
    try {
      persisted = await createImportedApplication({
        program: source.program,
        answers: row.answers,
        submittedAt: row.submittedAt,
        importSource,
        importSubmissionId: buildAcademyImportSubmissionId({
          importSource,
          submittedAt: row.submittedAt,
          email: row.email,
        }),
        importContentHash: buildAcademyImportContentHash({
          program: source.program,
          submittedAt: row.submittedAt,
          answers: row.answers,
        }),
        dryRun: options.dryRun,
      });
    } catch (error) {
      // A single row failed to persist — most often because a legacy row
      // had its `import_submission_id` set by a prior run under a different
      // hash, so the legacy lookup found it but the conditional update
      // returned no rows. Don't abandon the rest of the source: record the
      // error and move on. The admin can inspect / repair the offending
      // application manually.
      result.failedRows += 1;
      const detail = error instanceof Error ? error.message : String(error);
      result.errors.push(
        `Row ${row.sourceRowNumber} (${row.email}): ${detail}`,
      );
      continue;
    }

    if (persisted.status === "inserted") {
      result.inserted += 1;
      if (persisted.contactId) {
        result.insertedContactIds.push(persisted.contactId);
      }
      continue;
    }

    if (persisted.status === "backfilled") {
      result.backfilled += 1;
      continue;
    }

    if (persisted.status === "duplicate") {
      result.duplicates += 1;
      continue;
    }

    if (persisted.status === "drift") {
      result.drifted += 1;
      result.driftDetails.push(persisted);
      const fieldList = persisted.changedFields
        .map((change) => change.field)
        .join(", ");
      result.errors.push(
        `Row ${row.sourceRowNumber}: drift for ${row.email}` +
          (fieldList ? ` — changed: ${fieldList}` : ""),
      );
      continue;
    }

    if (persisted.status === "ambiguous") {
      result.ambiguous += 1;
      result.ambiguousDetails.push({
        email: row.email,
        sourceRowNumber: row.sourceRowNumber,
        applicationIds: persisted.applicationIds,
      });
      result.errors.push(
        `Row ${row.sourceRowNumber}: ambiguous legacy match for ${row.email}`,
      );
      continue;
    }

    if (persisted.status === "would_insert") {
      result.inserted += 1;
      result.insertPreviews.push({
        email: row.email,
        name: buildPreviewName(row.answers),
        program: source.program,
        sourceRowNumber: row.sourceRowNumber,
        submittedAt: row.submittedAt,
      });
      continue;
    }

    if (persisted.status === "would_backfill") {
      result.backfilled += 1;
    }
  }

  return result;
}

function buildPreviewName(answers: Record<string, unknown>): string {
  const first =
    typeof answers.first_name === "string" ? answers.first_name.trim() : "";
  const last =
    typeof answers.last_name === "string" ? answers.last_name.trim() : "";
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || "—";
}

export async function runAcademySheetsImport(
  sources: AcademyImportSource[],
  options: { dryRun?: boolean } = {},
): Promise<AcademySheetsImportSummary> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await importAcademySheetSource(source, options);
      } catch (error) {
        return {
          source,
          scanned: 0,
          inserted: 0,
          backfilled: 0,
          duplicates: 0,
          drifted: 0,
          ambiguous: 0,
          invalid: 0,
          failedRows: 0,
          failed: true,
          errors: [
            error instanceof Error ? error.message : String(error),
          ],
          insertedContactIds: [],
          driftDetails: [],
          insertPreviews: [],
          ambiguousDetails: [],
        } satisfies AcademySheetImportResult;
      }
    }),
  );

  return {
    dryRun: options.dryRun ?? false,
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    backfilled: results.reduce((sum, result) => sum + result.backfilled, 0),
    duplicates: results.reduce((sum, result) => sum + result.duplicates, 0),
    drifted: results.reduce((sum, result) => sum + result.drifted, 0),
    ambiguous: results.reduce((sum, result) => sum + result.ambiguous, 0),
    invalid: results.reduce((sum, result) => sum + result.invalid, 0),
    failedRows: results.reduce((sum, result) => sum + result.failedRows, 0),
    failedSources: results.filter((result) => result.failed).length,
    insertedContactIds: [...new Set(results.flatMap((result) => result.insertedContactIds))],
    sources: results,
  };
}
