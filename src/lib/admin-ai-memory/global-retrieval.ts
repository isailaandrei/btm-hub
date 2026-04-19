/**
 * Global cohort memory retrieval — single-pass dossier cohort path.
 *
 * Loads the whole eligible dossier cohort, projects each contact into a
 * bounded prompt block, and resolves anchor-backed support refs to raw
 * chunk-backed evidence rows for post-call citation hydration.
 */

import { after } from "next/server";
import { adminAiDebugLog } from "@/lib/admin-ai/debug";
import {
  listAdminAiEvidenceByIds,
  queryAdminAiContactFacts,
} from "@/lib/data/admin-ai-retrieval";
import {
  listContactDossierStates,
  listContactDossiers,
} from "@/lib/data/admin-ai-memory";
import { areAiRebuildsDisabled } from "./ai-rebuild-guard";
import { rebuildContactMemory } from "./backfill";
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

type ProjectionCompressionLevel = "full" | "compact" | "minimal";

const SINGLE_PASS_LEVELS: Array<{
  name: ProjectionCompressionLevel;
  maxAnchors: number;
  maxContradictions: number;
  maxUnknowns: number;
  includeSummary: boolean;
  includeExtendedFacts: boolean;
}> = [
  {
    name: "full",
    maxAnchors: 6,
    maxContradictions: 2,
    maxUnknowns: 2,
    includeSummary: true,
    includeExtendedFacts: true,
  },
  {
    name: "compact",
    maxAnchors: 4,
    maxContradictions: 1,
    maxUnknowns: 1,
    includeSummary: true,
    includeExtendedFacts: false,
  },
  {
    name: "minimal",
    maxAnchors: 2,
    maxContradictions: 0,
    maxUnknowns: 0,
    includeSummary: false,
    includeExtendedFacts: false,
  },
] as const;

export type GlobalSupportRefResolution = {
  contactId: string;
  claim: string;
  chunkIds: string[];
};

export type GlobalSinglePassCohortMemory = {
  candidates: ContactFactRow[];
  projections: GlobalCohortProjection[];
  supportRefMap: Map<string, GlobalSupportRefResolution>;
  evidence: EvidenceItem[];
  contactsMissingDossiers: string[];
  contactsServingStaleDossiers: string[];
  cohortTokenEstimate: number;
  cohortTokenBudget: number;
  compressionLevel: ProjectionCompressionLevel;
  wasCompressed: boolean;
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
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
  const structuredFacts =
    facts && typeof facts === "object" && "structuredFacts" in facts
      ? facts.structuredFacts
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
  };

  if (!input.includeExtendedFacts) {
    return compact;
  }

  compact.budgetValues =
    structuredFacts &&
    typeof structuredFacts === "object" &&
    "budgetValues" in structuredFacts
      ? readStringArray(structuredFacts.budgetValues)
      : input.candidate.budget
        ? [input.candidate.budget]
        : [];
  compact.timeAvailabilityValues =
    structuredFacts &&
    typeof structuredFacts === "object" &&
    "timeAvailabilityValues" in structuredFacts
      ? readStringArray(structuredFacts.timeAvailabilityValues)
      : input.candidate.time_availability
        ? [input.candidate.time_availability]
        : [];
  compact.travelWillingnessValues =
    structuredFacts &&
    typeof structuredFacts === "object" &&
    "travelWillingnessValues" in structuredFacts
      ? readStringArray(structuredFacts.travelWillingnessValues)
      : input.candidate.travel_willingness
        ? [input.candidate.travel_willingness]
        : [];
  compact.languageValues =
    structuredFacts &&
    typeof structuredFacts === "object" &&
    "languageValues" in structuredFacts
      ? readStringArray(structuredFacts.languageValues)
      : input.candidate.languages
        ? [input.candidate.languages]
        : [];
  compact.countryOfResidenceValues =
    structuredFacts &&
    typeof structuredFacts === "object" &&
    "countryOfResidenceValues" in structuredFacts
      ? readStringArray(structuredFacts.countryOfResidenceValues)
      : input.candidate.country_of_residence
        ? [input.candidate.country_of_residence]
        : [];

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
  contactId: string;
  maxAnchors: number;
  nextSupportRefIndex: { current: number };
  supportRefMap: Map<string, GlobalSupportRefResolution>;
}): GlobalCohortProjection["supportRefs"] {
  return input.dossier.evidence_anchors_json.slice(0, input.maxAnchors).map(
    (anchor) => {
      const supportRef = `support_${input.nextSupportRefIndex.current++}`;
      input.supportRefMap.set(supportRef, {
        contactId: input.contactId,
        claim: anchor.claim,
        chunkIds: anchor.chunkIds,
      });
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
  supportRefMap: Map<string, GlobalSupportRefResolution>;
  evidenceIds: string[];
  tokenEstimate: number;
} {
  const projections: GlobalCohortProjection[] = [];
  const supportRefMap = new Map<string, GlobalSupportRefResolution>();
  const nextSupportRefIndex = { current: 1 };

  for (const candidate of input.candidateRows) {
    const dossier = input.dossiersById.get(candidate.contact_id);
    if (!dossier) {
      projections.push(buildMissingProjection({ candidate }));
      continue;
    }

    const supportRefs = buildProjectedSupportRefs({
      dossier,
      contactId: candidate.contact_id,
      maxAnchors: input.level.maxAnchors,
      nextSupportRefIndex,
      supportRefMap,
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
      summary: input.level.includeSummary ? dossier.short_summary : null,
      supportRefs,
      contradictions: dossier.contradictions_json.slice(
        0,
        input.level.maxContradictions,
      ),
      unknowns: dossier.unknowns_json.slice(0, input.level.maxUnknowns),
    });
  }

  const evidenceIds = Array.from(
    new Set(
      Array.from(supportRefMap.values()).flatMap((value) => value.chunkIds),
    ),
  );

  return {
    projections,
    supportRefMap,
    evidenceIds,
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

  const evidence = await listAdminAiEvidenceByIds({
    evidenceIds: selectedProjection?.evidenceIds ?? [],
  });

  adminAiDebugLog("global-single-pass-cohort", {
    candidateCount: candidates.length,
    uniqueContactCount: candidateRows.length,
    dossierCount: dossiers.length,
    contactsMissingDossiers: contactsMissingDossiers.length,
    contactsServingStaleDossiers: contactsServingStaleDossiers.length,
    projectionCount: selectedProjection?.projections.length ?? 0,
    supportRefCount: selectedProjection?.supportRefMap.size ?? 0,
    evidenceCount: evidence.length,
    compressionLevel: selectedLevel.name,
    cohortTokenEstimate: selectedProjection?.tokenEstimate ?? 0,
  });

  return {
    candidates,
    projections: selectedProjection?.projections ?? [],
    supportRefMap: selectedProjection?.supportRefMap ?? new Map(),
    evidence,
    contactsMissingDossiers,
    contactsServingStaleDossiers,
    cohortTokenEstimate: selectedProjection?.tokenEstimate ?? 0,
    cohortTokenBudget: MAX_GLOBAL_SINGLE_PASS_TOKENS,
    compressionLevel: selectedLevel.name,
    wasCompressed: selectedLevel.name !== "full",
  };
}
