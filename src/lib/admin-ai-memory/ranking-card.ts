/**
 * Deterministic projection: dossier -> ranking card.
 *
 * The ranking card is the cheap whole-cohort surface used by the global
 * ranking pass. It must be derivable from the dossier without an extra
 * model call so:
 *   - rebuilding it is free,
 *   - the prompt cost stays low when ranking 250+ contacts,
 *   - any drift between dossier and card is purely a code-path issue.
 */

import type {
  CrmAiContactDossier,
  CrmAiContactRankingCardInput,
  DossierConfidence,
  DossierSignalEntry,
} from "@/types/admin-ai-memory";

const TOP_FIT_SIGNALS_LIMIT = 3;
const TOP_CONCERNS_LIMIT = 3;
const CONFIDENCE_NOTES_LIMIT = 3;

const CONFIDENCE_RANK: Record<DossierConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function pickTopSignals(
  signals: DossierSignalEntry[],
  limit: number,
): DossierSignalEntry[] {
  // Stable sort by confidence (high -> low), keep input order as the
  // tie-breaker so the dossier author's original ordering wins inside a
  // confidence bucket.
  const indexed = signals.map((entry, index) => ({ entry, index }));
  indexed.sort((a, b) => {
    const rankDiff =
      CONFIDENCE_RANK[a.entry.confidence] - CONFIDENCE_RANK[b.entry.confidence];
    if (rankDiff !== 0) return rankDiff;
    return a.index - b.index;
  });
  return indexed.slice(0, limit).map((wrapped) => wrapped.entry);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const contact = isRecord(facts.contact) ? facts.contact : null;
  const applications = isRecord(facts.applications) ? facts.applications : null;
  const tags = isRecord(facts.tags) ? facts.tags : null;
  const structuredFacts = isRecord(facts.structuredFacts)
    ? facts.structuredFacts
    : null;

  if (!contact && !applications && !tags && !structuredFacts) {
    return facts;
  }

  return {
    contactName: contact?.contactName ?? null,
    applicationCount: applications?.applicationCount ?? null,
    programHistory: applications?.programHistory ?? [],
    statusHistory: applications?.statusHistory ?? [],
    tagNames: tags?.tagNames ?? [],
    budgetValues: structuredFacts?.budgetValues ?? [],
    timeAvailabilityValues: structuredFacts?.timeAvailabilityValues ?? [],
    startTimelineValues: structuredFacts?.startTimelineValues ?? [],
    btmCategoryValues: structuredFacts?.btmCategoryValues ?? [],
    travelWillingnessValues: structuredFacts?.travelWillingnessValues ?? [],
    languageValues: structuredFacts?.languageValues ?? [],
    countryOfResidenceValues: structuredFacts?.countryOfResidenceValues ?? [],
    certificationLevelValues: structuredFacts?.certificationLevelValues ?? [],
    yearsExperienceValues: structuredFacts?.yearsExperienceValues ?? [],
    involvementLevelValues: structuredFacts?.involvementLevelValues ?? [],
  };
}

export function buildRankingCardFromDossier(
  dossier: CrmAiContactDossier,
): CrmAiContactRankingCardInput {
  const fitSignals = pickTopSignals(
    dossier.signals_json.fitSignals,
    TOP_FIT_SIGNALS_LIMIT,
  );
  const concerns = pickTopSignals(
    dossier.signals_json.concerns,
    TOP_CONCERNS_LIMIT,
  );

  // Confidence notes are a compact admin-readable trail for "why this
  // ranking card might not be the full story". We seed it with the dossier
  // unknowns since those are the most actionable gaps for ranking.
  const confidenceNotes = dossier.unknowns_json.slice(0, CONFIDENCE_NOTES_LIMIT);

  return {
    contactId: dossier.contact_id,
    dossierVersion: dossier.dossier_version,
    sourceFingerprint: dossier.source_fingerprint,
    facts: compactFacts(dossier.facts_json),
    topFitSignals: fitSignals,
    topConcerns: concerns,
    confidenceNotes,
    shortSummary: dossier.short_summary,
  };
}
