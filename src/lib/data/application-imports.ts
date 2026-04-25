import type { ProgramSlug } from "@/types/database";
import {
  buildAcademyImportContentHash,
  normalizeImportedEmail,
  normalizeImportSubmittedAt,
} from "@/lib/academy/import";
import { createAdminClient } from "@/lib/supabase/admin";

type ImportedApplicationInput = {
  program: ProgramSlug;
  answers: Record<string, unknown>;
  submittedAt: string | null;
  importSource: string;
  importSubmissionId: string;
  importContentHash: string;
  dryRun?: boolean;
};

type ExistingImportedApplication = {
  id: string;
  import_content_hash: string | null;
  contact_id: string | null;
  submitted_at: string | null;
  answers: Record<string, unknown> | null;
};

type ExistingLegacyApplication = {
  id: string;
  contact_id: string | null;
  submitted_at: string | null;
  answers: Record<string, unknown> | null;
};

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

export type ApplicationImportFieldChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type ApplicationImportDriftDetail = {
  applicationId: string;
  contactId: string | null;
  email: string | null;
  submittedAt: string | null;
  driftKind: "already_imported" | "legacy";
  changedFields: ApplicationImportFieldChange[];
};

export type ApplicationImportInsertPreview = {
  email: string;
  name: string;
  program: ProgramSlug;
  sourceRowNumber: number;
  submittedAt: string | null;
};

export type ApplicationImportAmbiguousDetail = {
  email: string;
  sourceRowNumber: number;
  applicationIds: string[];
};

export type CreateImportedApplicationResult =
  | {
      status: "inserted" | "backfilled" | "duplicate";
      applicationId: string;
      contactId: string | null;
    }
  | ({ status: "drift" } & ApplicationImportDriftDetail)
  | {
      status: "ambiguous";
      applicationIds: string[];
    }
  | {
      status: "would_insert" | "would_backfill";
    };

function getAnswersRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function buildApplicantName(answers: Record<string, unknown>): string {
  const firstName =
    typeof answers.first_name === "string" ? answers.first_name.trim() : "";
  const lastName =
    typeof answers.last_name === "string" ? answers.last_name.trim() : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (name) return name;

  const email =
    typeof answers.email === "string" ? normalizeImportedEmail(answers.email) : "";
  return email || "Unknown";
}

/**
 * Canonical form used ONLY for diff filtering — strictly looser than the
 * canonicalization fed into the import content hash. Two values that share
 * a canonical form here are treated as cosmetically equal:
 *   - leading/trailing whitespace, surrounding straight or smart quotes,
 *     and zero-width characters are stripped
 *   - internal whitespace runs collapse to a single space
 *   - case is folded (lowercased) after NFKC normalization
 *   - empty / null / undefined / "" all collapse to undefined
 *   - arrays are deep-canonicalized item-wise and order-insensitive
 * If we ever surface a "real" diff to admins, that diff is something a
 * human would call meaningful — not "Max" vs "max" or "yes" vs " yes ".
 */
function canonicalForDiff(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const cleaned = value
      .normalize("NFKC")
      .replace(/[​‌‍﻿]/g, "")
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return cleaned === "" ? undefined : cleaned;
  }
  if (Array.isArray(value)) {
    // Multiselect arrays. Split every item on commas before deduping/sorting
    // so that an option containing internal commas (e.g. "Action camera
    // (GoPro, Osmo, Insta360, etc)") compares equal whether the CSV parser
    // kept it whole or fragmented it across multiple array entries. In this
    // domain the parser has been historically unreliable about commas-inside-
    // parens, and we'd rather collapse those false-positive diffs than catch
    // a (rare) case where two genuinely-distinct options share the same
    // comma-separated tokens.
    const tokens = new Set<string>();
    for (const raw of value) {
      const piece = canonicalForDiff(raw);
      if (typeof piece === "string") {
        for (const part of piece.split(",")) {
          const trimmed = part.trim();
          if (trimmed) tokens.add(trimmed);
        }
      } else if (piece !== undefined) {
        tokens.add(JSON.stringify(piece));
      }
    }
    return tokens.size === 0 ? undefined : [...tokens].sort();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function isCosmeticallyEqual(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(canonicalForDiff(a)) === JSON.stringify(canonicalForDiff(b))
  );
}

function diffAnswers(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ApplicationImportFieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: ApplicationImportFieldChange[] = [];
  for (const key of keys) {
    if (isCosmeticallyEqual(before[key], after[key])) continue;
    changes.push({ field: key, before: before[key], after: after[key] });
  }
  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

function classifyExistingApplication(
  existing: ExistingImportedApplication,
  next: {
    contentHash: string;
    answers: Record<string, unknown>;
  },
): CreateImportedApplicationResult {
  if (existing.import_content_hash === next.contentHash) {
    return {
      status: "duplicate",
      applicationId: existing.id,
      contactId: existing.contact_id,
    };
  }

  const beforeAnswers = getAnswersRecord(existing.answers);
  const changedFields = diffAnswers(beforeAnswers, next.answers);

  // Hash differs but the diff is purely cosmetic (capitalization,
  // surrounding quotes, whitespace, smart vs straight punctuation).
  // Treat as duplicate so admins don't have to triage noise on every run.
  if (changedFields.length === 0) {
    return {
      status: "duplicate",
      applicationId: existing.id,
      contactId: existing.contact_id,
    };
  }

  return {
    status: "drift",
    applicationId: existing.id,
    contactId: existing.contact_id,
    email: normalizeImportedEmail(next.answers.email) || null,
    submittedAt: existing.submitted_at,
    driftKind: "already_imported",
    changedFields,
  };
}

async function findImportedApplicationBySubmissionId(
  supabase: AdminClient,
  importSubmissionId: string,
): Promise<ExistingImportedApplication | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, import_content_hash, contact_id, submitted_at, answers")
    .eq("import_submission_id", importSubmissionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load imported application by submission id: ${error.message}`,
    );
  }

  return (data as ExistingImportedApplication | null) ?? null;
}

async function findLegacyApplications(
  supabase: AdminClient,
  input: ImportedApplicationInput,
): Promise<ExistingLegacyApplication[]> {
  const email = normalizeImportedEmail(input.answers.email);
  const submittedAt = normalizeImportSubmittedAt(input.submittedAt);
  if (!email || !submittedAt) {
    return [];
  }

  const end = new Date(new Date(submittedAt).getTime() + 1_000).toISOString();
  const { data, error } = await supabase
    .from("applications")
    .select("id, contact_id, submitted_at, answers")
    .eq("program", input.program)
    .is("import_submission_id", null)
    .gte("submitted_at", submittedAt)
    .lt("submitted_at", end);

  if (error) {
    throw new Error(`Failed to find legacy application matches: ${error.message}`);
  }

  return ((data as ExistingLegacyApplication[] | null) ?? []).filter((row) => {
    const answers = getAnswersRecord(row.answers);
    return normalizeImportedEmail(answers.email) === email;
  });
}

async function backfillImportMetadata(
  supabase: AdminClient,
  applicationId: string,
  input: {
    importSource: string;
    importSubmissionId: string;
    importContentHash: string;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("applications")
    .update({
      import_source: input.importSource,
      import_submission_id: input.importSubmissionId,
      import_content_hash: input.importContentHash,
    })
    .eq("id", applicationId)
    .is("import_submission_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return false;
    }

    throw new Error(`Failed to backfill import metadata: ${error.message}`);
  }

  return Boolean(data);
}

function buildLegacyContentHash(
  application: ExistingLegacyApplication,
  program: ProgramSlug,
): string {
  return buildAcademyImportContentHash({
    program,
    submittedAt: application.submitted_at,
    answers: getAnswersRecord(application.answers),
  });
}

export async function createImportedApplication(
  input: ImportedApplicationInput,
): Promise<CreateImportedApplicationResult> {
  const supabase = await createAdminClient();

  const existingImported = await findImportedApplicationBySubmissionId(
    supabase,
    input.importSubmissionId,
  );
  if (existingImported) {
    return classifyExistingApplication(existingImported, {
      contentHash: input.importContentHash,
      answers: input.answers,
    });
  }

  const legacyMatches = await findLegacyApplications(supabase, input);
  if (legacyMatches.length > 1) {
    return {
      status: "ambiguous",
      applicationIds: legacyMatches.map((match) => match.id),
    };
  }

  const legacyMatch = legacyMatches[0];
  if (legacyMatch) {
    const legacyContentHash = buildLegacyContentHash(legacyMatch, input.program);
    const isExactMatch = legacyContentHash === input.importContentHash;
    const legacyChangedFields = isExactMatch
      ? []
      : diffAnswers(getAnswersRecord(legacyMatch.answers), input.answers);
    // Cosmetic-only difference (case, quotes, whitespace) — treat as exact.
    const isCosmeticMatch = !isExactMatch && legacyChangedFields.length === 0;

    if (input.dryRun) {
      if (isExactMatch || isCosmeticMatch) {
        return { status: "would_backfill" };
      }
      return {
        status: "drift",
        applicationId: legacyMatch.id,
        contactId: legacyMatch.contact_id,
        email: normalizeImportedEmail(input.answers.email) || null,
        submittedAt: legacyMatch.submitted_at,
        driftKind: "legacy",
        changedFields: legacyChangedFields,
      };
    }

    const backfilled = await backfillImportMetadata(supabase, legacyMatch.id, {
      importSource: input.importSource,
      importSubmissionId: input.importSubmissionId,
      importContentHash: legacyContentHash,
    });

    if (!backfilled) {
      const conflictingImported = await findImportedApplicationBySubmissionId(
        supabase,
        input.importSubmissionId,
      );
      if (conflictingImported) {
        return classifyExistingApplication(conflictingImported, {
          contentHash: input.importContentHash,
          answers: input.answers,
        });
      }

      throw new Error(
        `Failed to backfill import metadata for application ${legacyMatch.id}`,
      );
    }

    if (isExactMatch || isCosmeticMatch) {
      return {
        status: "backfilled",
        applicationId: legacyMatch.id,
        contactId: legacyMatch.contact_id,
      };
    }
    return {
      status: "drift",
      applicationId: legacyMatch.id,
      contactId: legacyMatch.contact_id,
      email: normalizeImportedEmail(input.answers.email) || null,
      submittedAt: legacyMatch.submitted_at,
      driftKind: "legacy",
      changedFields: legacyChangedFields,
    };
  }

  if (input.dryRun) {
    return { status: "would_insert" };
  }

  const email = normalizeImportedEmail(input.answers.email);
  if (!email) {
    throw new Error("Imported application is missing an email address");
  }

  const phone =
    typeof input.answers.phone === "string" && input.answers.phone.trim() !== ""
      ? input.answers.phone.trim()
      : null;

  const { data: contactId, error: contactError } = await supabase.rpc(
    "find_or_create_contact",
    {
      p_email: email,
      p_name: buildApplicantName(input.answers),
      p_phone: phone,
    },
  );

  if (contactError) {
    throw new Error(
      `Failed to find or create contact for imported application: ${contactError.message}`,
    );
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      program: input.program,
      status: "reviewing",
      contact_id: contactId,
      answers: input.answers,
      tags: [],
      admin_notes: [],
      submitted_at: input.submittedAt ?? new Date().toISOString(),
      import_source: input.importSource,
      import_submission_id: input.importSubmissionId,
      import_content_hash: input.importContentHash,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const conflicting = await findImportedApplicationBySubmissionId(
        supabase,
        input.importSubmissionId,
      );
      if (conflicting) {
        return classifyExistingApplication(conflicting, {
          contentHash: input.importContentHash,
          answers: input.answers,
        });
      }
    }

    throw new Error(`Failed to insert imported application: ${error.message}`);
  }

  return {
    status: "inserted",
    applicationId: String(data.id),
    contactId: (contactId as string | null) ?? null,
  };
}
