/**
 * Global cohort memory retrieval — single-pass dossier cohort path.
 *
 * Loads the whole eligible dossier cohort, projects each contact into a
 * bounded prompt block, and pairs that cache-friendly profile scaffold
 * with a dynamic hybrid-retrieved evidence pack.
 */

import { after } from "next/server";
import { createHash } from "crypto";
import { adminAiDebugLog } from "@/lib/admin-ai/debug";
import {
  queryAdminAiContactFacts,
} from "@/lib/data/admin-ai-retrieval";
import {
  listContactDossierStates,
  listContactDossiers,
} from "@/lib/data/admin-ai-memory";
import { areAiRebuildsDisabled } from "./ai-rebuild-guard";
import { rebuildContactMemory } from "./backfill";
import { retrieveHybridEvidence } from "./retrieval-fusion";
import {
  isDossierSoftStale,
  shouldForceDossierRefreshOnRead,
} from "./freshness";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
  EvidenceItem,
  GlobalCohortProjection,
} from "@/types/admin-ai";
import type {
  DossierConfidence,
  CrmAiContactDossier,
} from "@/types/admin-ai-memory";

export const MAX_GLOBAL_DOSSIER_COHORT = 250;
export const MAX_GLOBAL_SINGLE_PASS_TOKENS = 240_000;
export const MAX_BACKGROUND_MEMORY_REFRESHES = 1;
export const MAX_GLOBAL_DYNAMIC_EVIDENCE = 60;

type ProjectionCompressionLevel = "full" | "compact" | "minimal";

const SINGLE_PASS_LEVELS: Array<{
  name: ProjectionCompressionLevel;
  maxAnchors: number;
  maxSignalsPerCategory: number;
  maxContradictions: number;
  maxUnknowns: number;
  includeSummary: boolean;
  includeExtendedFacts: boolean;
}> = [
  {
    name: "full",
    maxAnchors: 6,
    maxSignalsPerCategory: 2,
    maxContradictions: 2,
    maxUnknowns: 2,
    includeSummary: true,
    includeExtendedFacts: true,
  },
  {
    name: "compact",
    maxAnchors: 4,
    maxSignalsPerCategory: 1,
    maxContradictions: 1,
    maxUnknowns: 1,
    includeSummary: true,
    includeExtendedFacts: false,
  },
  {
    name: "minimal",
    maxAnchors: 2,
    maxSignalsPerCategory: 0,
    maxContradictions: 0,
    maxUnknowns: 0,
    includeSummary: false,
    includeExtendedFacts: false,
  },
] as const;

export type GlobalSinglePassCohortMemory = {
  candidates: ContactFactRow[];
  projections: GlobalCohortProjection[];
  evidence: EvidenceItem[];
  contactsMissingDossiers: string[];
  contactsServingStaleDossiers: string[];
  cohortTokenEstimate: number;
  cohortTokenBudget: number;
  compressionLevel: ProjectionCompressionLevel;
  wasCompressed: boolean;
  promptCacheKey: string;
};

function scheduleBackgroundMemoryRefresh(contactIds: string[]): void {
  if (areAiRebuildsDisabled()) {
    console.info(
      "[admin-ai-memory] background cohort refresh skipped — ADMIN_AI_DISABLE_REBUILDS is set",
      { contactIds: contactIds.slice(0, MAX_BACKGROUND_MEMORY_REFRESHES) },
    );
    return;
  }
  const queuedContactIds = contactIds.slice(0, MAX_BACKGROUND_MEMORY_REFRESHES);
  if (queuedContactIds.length === 0) return;
  adminAiDebugLog("background-memory-refresh-scheduled", {
    queuedContactIds,
    totalRequested: contactIds.length,
  });

  after(async () => {
    const results = await Promise.allSettled(
      queuedContactIds.map(async (contactId) =>
        rebuildContactMemory({ contactId }),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      console.error(
        "[admin-ai-memory] background cohort refresh failed",
        {
          contactId: queuedContactIds[index],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
      );
    });
  });
}

function estimateTokenCount(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function buildPromptCacheKey(input: {
  projections: GlobalCohortProjection[];
  coverage: {
    totalCandidates: number;
    candidatesWithoutDossierCount: number;
    staleDossierCount: number;
    compressionLevel: ProjectionCompressionLevel;
    wasCompressed: boolean;
  };
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        coverage: input.coverage,
        cohort: input.projections,
      }),
    )
    .digest("hex");
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readStringRecordEntries(value: unknown): Array<{
  fieldKey: string;
  rawValues: string[];
  normalizedValues: string[];
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .map(([fieldKey, rawValues]) => ({
      fieldKey,
      rawValues: readStringArray(rawValues),
      normalizedValues: readStringArray(rawValues),
    }))
    .filter((entry) => entry.normalizedValues.length > 0)
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

function readStructuredFieldDetailEntries(value: unknown): Array<{
  fieldKey: string;
  rawValues: string[];
  normalizedValues: string[];
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .map(([fieldKey, raw]) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const rawValues =
        "rawValues" in raw ? readStringArray(raw.rawValues) : [];
      const normalizedValues =
        "normalizedValues" in raw
          ? readStringArray(raw.normalizedValues)
          : [];
      if (rawValues.length === 0 && normalizedValues.length === 0) return null;
      return {
        fieldKey,
        rawValues,
        normalizedValues:
          normalizedValues.length > 0 ? normalizedValues : rawValues,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        fieldKey: string;
        rawValues: string[];
        normalizedValues: string[];
      } => entry !== null,
    )
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

function readSignalEntries(
  value: unknown,
  maxPerCategory: number,
): GlobalCohortProjection["signals"] | undefined {
  if (
    maxPerCategory <= 0 ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const readEntries = (entries: unknown) =>
    Array.isArray(entries)
      ? entries
          .filter(
            (
              entry,
            ): entry is { value: string; confidence: "high" | "medium" | "low" } =>
              Boolean(
                entry &&
                  typeof entry === "object" &&
                  "value" in entry &&
                  typeof entry.value === "string" &&
                  "confidence" in entry &&
                  (entry.confidence === "high" ||
                    entry.confidence === "medium" ||
                    entry.confidence === "low"),
              ),
          )
          .slice(0, maxPerCategory)
      : [];

  return {
    motivation: readEntries("motivation" in value ? value.motivation : []),
    communicationStyle: readEntries(
      "communicationStyle" in value ? value.communicationStyle : [],
    ),
    reliabilitySignals: readEntries(
      "reliabilitySignals" in value ? value.reliabilitySignals : [],
    ),
    fitSignals: readEntries("fitSignals" in value ? value.fitSignals : []),
    concerns: readEntries("concerns" in value ? value.concerns : []),
  };
}

function findStructuredFieldValues(
  entries: Array<{
    fieldKey: string;
    rawValues: string[];
    normalizedValues: string[];
  }>,
  fieldKey: string,
): string[] {
  const match = entries.find((entry) => entry.fieldKey === fieldKey);
  if (!match) return [];
  return match.normalizedValues.length > 0 ? match.normalizedValues : match.rawValues;
}

function compactProjectionFacts(input: {
  dossier?: CrmAiContactDossier | null;
  candidate: ContactFactRow;
  includeExtendedFacts: boolean;
}): GlobalCohortProjection["facts"] {
  const facts = input.dossier?.facts_json ?? {};
  const applications =
    facts && typeof facts === "object" && "applications" in facts
      ? facts.applications
      : null;
  const tags =
    facts && typeof facts === "object" && "tags" in facts
      ? facts.tags
      : null;
  const legacyStructuredFacts =
    facts && typeof facts === "object" && "structuredFacts" in facts
      ? facts.structuredFacts
      : null;
  const legacyStructuredFieldValues =
    facts && typeof facts === "object" && "allStructuredFieldValues" in facts
      ? facts.allStructuredFieldValues
      : null;
  const structuredFieldDetails =
    facts && typeof facts === "object" && "structuredFieldDetails" in facts
      ? facts.structuredFieldDetails
      : null;
  const observationSummary =
    facts && typeof facts === "object" && "observationSummary" in facts
      ? facts.observationSummary
      : null;

  const compact: GlobalCohortProjection["facts"] = {
    programHistory:
      applications &&
      typeof applications === "object" &&
      "programHistory" in applications
        ? readStringArray(applications.programHistory)
        : input.candidate.program
          ? [input.candidate.program]
          : [],
    statusHistory:
      applications &&
      typeof applications === "object" &&
      "statusHistory" in applications
        ? readStringArray(applications.statusHistory)
        : input.candidate.status
          ? [input.candidate.status]
          : [],
    tagNames:
      tags && typeof tags === "object" && "tagNames" in tags
        ? readStringArray(tags.tagNames)
        : input.candidate.tag_names,
    conflictingFieldKeys:
      observationSummary &&
      typeof observationSummary === "object" &&
      "conflictingFields" in observationSummary
        ? readStringArray(observationSummary.conflictingFields)
        : [],
  };

  if (!input.includeExtendedFacts) {
    return compact;
  }

  const currentStructuredFields =
    readStructuredFieldDetailEntries(structuredFieldDetails).length > 0
      ? readStructuredFieldDetailEntries(structuredFieldDetails)
      : readStringRecordEntries(legacyStructuredFieldValues);
  compact.budgetValues =
    findStructuredFieldValues(currentStructuredFields, "budget").length > 0
      ? findStructuredFieldValues(currentStructuredFields, "budget")
      : legacyStructuredFacts &&
          typeof legacyStructuredFacts === "object" &&
          "budgetValues" in legacyStructuredFacts
        ? readStringArray(legacyStructuredFacts.budgetValues)
        : input.candidate.budget
          ? [input.candidate.budget]
          : [];
  compact.timeAvailabilityValues =
    findStructuredFieldValues(currentStructuredFields, "time_availability")
      .length > 0
      ? findStructuredFieldValues(currentStructuredFields, "time_availability")
      : legacyStructuredFacts &&
          typeof legacyStructuredFacts === "object" &&
          "timeAvailabilityValues" in legacyStructuredFacts
        ? readStringArray(legacyStructuredFacts.timeAvailabilityValues)
        : input.candidate.time_availability
          ? [input.candidate.time_availability]
          : [];
  compact.travelWillingnessValues =
    findStructuredFieldValues(currentStructuredFields, "travel_willingness")
      .length > 0
      ? findStructuredFieldValues(currentStructuredFields, "travel_willingness")
      : legacyStructuredFacts &&
          typeof legacyStructuredFacts === "object" &&
          "travelWillingnessValues" in legacyStructuredFacts
        ? readStringArray(legacyStructuredFacts.travelWillingnessValues)
        : input.candidate.travel_willingness
          ? [input.candidate.travel_willingness]
          : [];
  compact.languageValues =
    findStructuredFieldValues(currentStructuredFields, "languages").length > 0
      ? findStructuredFieldValues(currentStructuredFields, "languages")
      : legacyStructuredFacts &&
          typeof legacyStructuredFacts === "object" &&
          "languageValues" in legacyStructuredFacts
        ? readStringArray(legacyStructuredFacts.languageValues)
        : input.candidate.languages
          ? [input.candidate.languages]
          : [];
  compact.countryOfResidenceValues =
    findStructuredFieldValues(currentStructuredFields, "country_of_residence")
      .length > 0
      ? findStructuredFieldValues(currentStructuredFields, "country_of_residence")
      : legacyStructuredFacts &&
          typeof legacyStructuredFacts === "object" &&
          "countryOfResidenceValues" in legacyStructuredFacts
        ? readStringArray(legacyStructuredFacts.countryOfResidenceValues)
        : input.candidate.country_of_residence
          ? [input.candidate.country_of_residence]
          : [];
  compact.currentStructuredFields = currentStructuredFields;

  return compact;
}

function buildMissingProjection(input: {
  candidate: ContactFactRow;
}): GlobalCohortProjection {
  return {
    contactId: input.candidate.contact_id,
    contactName: input.candidate.contact_name,
    memoryStatus: "missing",
    coverage: {
      applicationCount: input.candidate.application_id ? 1 : 0,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
    },
    facts: compactProjectionFacts({
      candidate: input.candidate,
      includeExtendedFacts: false,
    }),
    summary: null,
    supportRefs: [],
    contradictions: [],
    unknowns: ["No dossier has been built for this contact yet."],
  };
}

function buildProjectedSupportRefs(input: {
  dossier: CrmAiContactDossier;
  maxAnchors: number;
  nextSupportRefIndex: { current: number };
}): GlobalCohortProjection["supportRefs"] {
  return input.dossier.evidence_anchors_json.slice(0, input.maxAnchors).map(
    (anchor) => {
      const supportRef = `support_${input.nextSupportRefIndex.current++}`;
      return {
        supportRef,
        claim: anchor.claim,
        confidence: anchor.confidence as DossierConfidence,
      };
    },
  );
}

function buildProjectedCohort(input: {
  candidateRows: ContactFactRow[];
  dossiersById: Map<string, CrmAiContactDossier>;
  staleContactIds: Set<string>;
  level: (typeof SINGLE_PASS_LEVELS)[number];
}): {
  projections: GlobalCohortProjection[];
  tokenEstimate: number;
} {
  const projections: GlobalCohortProjection[] = [];
  const nextSupportRefIndex = { current: 1 };

  for (const candidate of input.candidateRows) {
    const dossier = input.dossiersById.get(candidate.contact_id);
    if (!dossier) {
      projections.push(buildMissingProjection({ candidate }));
      continue;
    }

    const supportRefs = buildProjectedSupportRefs({
      dossier,
      maxAnchors: input.level.maxAnchors,
      nextSupportRefIndex,
    });

    projections.push({
      contactId: candidate.contact_id,
      contactName: candidate.contact_name,
      memoryStatus: input.staleContactIds.has(candidate.contact_id)
        ? "stale"
        : "fresh",
      coverage: {
        applicationCount: dossier.source_coverage.applicationCount,
        contactNoteCount: dossier.source_coverage.contactNoteCount,
        applicationAdminNoteCount:
          dossier.source_coverage.applicationAdminNoteCount,
      },
      facts: compactProjectionFacts({
        dossier,
        candidate,
        includeExtendedFacts: input.level.includeExtendedFacts,
      }),
      signals: readSignalEntries(
        dossier.signals_json,
        input.level.maxSignalsPerCategory,
      ),
      summary: input.level.includeSummary ? dossier.short_summary : null,
      supportRefs,
      contradictions: dossier.contradictions_json.slice(
        0,
        input.level.maxContradictions,
      ),
      unknowns: dossier.unknowns_json.slice(0, input.level.maxUnknowns),
    });
  }

  return {
    projections,
    tokenEstimate: estimateTokenCount(projections),
  };
}

function uniqueCandidateRowsByContact(
  rows: ContactFactRow[],
): ContactFactRow[] {
  const seen = new Set<string>();
  const unique: ContactFactRow[] = [];
  for (const row of rows) {
    if (seen.has(row.contact_id)) continue;
    seen.add(row.contact_id);
    unique.push(row);
  }
  return unique;
}

export async function assembleGlobalSinglePassCohort(input: {
  plan: AdminAiQueryPlan;
  question: string;
}): Promise<GlobalSinglePassCohortMemory> {
  const candidates = await queryAdminAiContactFacts({
    filters: input.plan.structuredFilters,
    limit: MAX_GLOBAL_DOSSIER_COHORT,
  });
  const candidateRows = uniqueCandidateRowsByContact(candidates);
  const contactIds = candidateRows.map((candidate) => candidate.contact_id);

  const dossiers = contactIds.length
    ? await listContactDossiers({ contactIds })
    : [];
  const dossierStates = contactIds.length
    ? await listContactDossierStates({ contactIds })
    : [];

  const dossierById = new Map(
    dossiers.map((dossier) => [dossier.contact_id, dossier] as const),
  );
  const contactsMissingDossiers = contactIds.filter(
    (contactId) => !dossierById.has(contactId),
  );
  const contactsServingStaleDossiers = dossierStates
    .filter((dossier) => {
      if (
        shouldForceDossierRefreshOnRead({
          dossier,
          generatorVersion: DOSSIER_GENERATOR_VERSION,
          dossierVersion: DOSSIER_SCHEMA_VERSION,
        })
      ) {
        return true;
      }
      return isDossierSoftStale({ dossier });
    })
    .map((dossier) => dossier.contact_id);

  const contactsNeedingRefresh = Array.from(
    new Set([...contactsMissingDossiers, ...contactsServingStaleDossiers]),
  );
  if (contactsNeedingRefresh.length > 0) {
    scheduleBackgroundMemoryRefresh(contactsNeedingRefresh);
  }

  const staleContactIds = new Set(contactsServingStaleDossiers);
  let selectedProjection:
    | ReturnType<typeof buildProjectedCohort>
    | null = null;
  let selectedLevel = SINGLE_PASS_LEVELS[SINGLE_PASS_LEVELS.length - 1]!;

  for (const level of SINGLE_PASS_LEVELS) {
    const projection = buildProjectedCohort({
      candidateRows,
      dossiersById: dossierById,
      staleContactIds,
      level,
    });
    selectedProjection = projection;
    selectedLevel = level;
    if (projection.tokenEstimate <= MAX_GLOBAL_SINGLE_PASS_TOKENS) {
      break;
    }
  }

  const evidence = await retrieveHybridEvidence({
    question: input.question,
    textFocus: input.plan.textFocus,
    contactIds,
    limit: MAX_GLOBAL_DYNAMIC_EVIDENCE,
  });
  const promptCacheKey = buildPromptCacheKey({
    projections: selectedProjection?.projections ?? [],
    coverage: {
      totalCandidates: candidateRows.length,
      candidatesWithoutDossierCount: contactsMissingDossiers.length,
      staleDossierCount: contactsServingStaleDossiers.length,
      compressionLevel: selectedLevel.name,
      wasCompressed: selectedLevel.name !== "full",
    },
  });

  adminAiDebugLog("global-single-pass-cohort", {
    candidateCount: candidates.length,
    uniqueContactCount: candidateRows.length,
    dossierCount: dossiers.length,
    contactsMissingDossiers: contactsMissingDossiers.length,
    contactsServingStaleDossiers: contactsServingStaleDossiers.length,
    projectionCount: selectedProjection?.projections.length ?? 0,
    supportRefCount:
      selectedProjection?.projections.reduce(
        (sum, projection) => sum + projection.supportRefs.length,
        0,
      ) ?? 0,
    evidenceCount: evidence.length,
    compressionLevel: selectedLevel.name,
    cohortTokenEstimate: selectedProjection?.tokenEstimate ?? 0,
    promptCacheKey,
  });

  return {
    candidates,
    projections: selectedProjection?.projections ?? [],
    evidence,
    contactsMissingDossiers,
    contactsServingStaleDossiers,
    cohortTokenEstimate: selectedProjection?.tokenEstimate ?? 0,
    cohortTokenBudget: MAX_GLOBAL_SINGLE_PASS_TOKENS,
    compressionLevel: selectedLevel.name,
    wasCompressed: selectedLevel.name !== "full",
    promptCacheKey,
  };
}
