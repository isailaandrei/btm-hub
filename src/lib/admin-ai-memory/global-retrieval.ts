/**
 * Global cohort memory retrieval — two-pass support.
 *
 * Pass 1 (`assembleGlobalCohortMemory`):
 *   - applies structured filters via the existing facts query
 *   - caps the cohort at MAX_RANKING_COHORT (250 by default)
 *   - loads ranking cards for that cohort (NOT dossiers, NOT raw chunks)
 *
 * Pass 2 (`expandFinalistEvidence`):
 *   - takes the shortlist from the ranking pass
 *   - loads dossiers + raw evidence ONLY for the shortlisted contacts
 *
 * This is the main cost-control behavior for global queries: ranking
 * cards stay cheap, dossiers and raw evidence are only loaded when we
 * actually need to justify a finalist's selection.
 */

import {
  queryAdminAiContactFacts,
  searchAdminAiEvidence,
} from "@/lib/data/admin-ai-retrieval";
import {
  listContactDossiers,
  listRankingCards,
} from "@/lib/data/admin-ai-memory";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
} from "@/types/admin-ai-memory";

export const MAX_RANKING_COHORT = 250;
export const MAX_FINALIST_EVIDENCE = 60;

export type GlobalCohortMemory = {
  candidates: ContactFactRow[];
  rankingCards: CrmAiContactRankingCard[];
  contactsMissingRankingCards: string[];
};

export async function assembleGlobalCohortMemory(input: {
  plan: AdminAiQueryPlan;
}): Promise<GlobalCohortMemory> {
  const { plan } = input;
  const factsLimit = Math.min(
    Math.max(plan.requestedLimit, 1),
    MAX_RANKING_COHORT,
  );

  const rawCandidates = await queryAdminAiContactFacts({
    filters: plan.structuredFilters,
    limit: factsLimit,
  });
  const candidates = rawCandidates.slice(0, MAX_RANKING_COHORT);

  const contactIds = Array.from(
    new Set(candidates.map((c) => c.contact_id).filter(Boolean) as string[]),
  );

  const rankingCards = contactIds.length
    ? await listRankingCards({
        contactIds,
        limit: MAX_RANKING_COHORT,
      })
    : [];

  const cardContactIds = new Set(rankingCards.map((c) => c.contact_id));
  const contactsMissingRankingCards = contactIds.filter(
    (id) => !cardContactIds.has(id),
  );

  return { candidates, rankingCards, contactsMissingRankingCards };
}

export type FinalistEvidence = {
  dossiers: CrmAiContactDossier[];
  evidence: EvidenceItem[];
};

export async function expandFinalistEvidence(input: {
  question: string;
  shortlistedContactIds: string[];
  textFocus: string[];
}): Promise<FinalistEvidence> {
  const ids = Array.from(new Set(input.shortlistedContactIds.filter(Boolean)));
  if (ids.length === 0) {
    return { dossiers: [], evidence: [] };
  }

  const [dossiers, evidence] = await Promise.all([
    listContactDossiers({ contactIds: ids }),
    searchAdminAiEvidence({
      textFocus: input.textFocus,
      contactIds: ids,
      limit: MAX_FINALIST_EVIDENCE,
    }),
  ]);

  // Defense-in-depth: any evidence row outside the shortlist is a leak.
  const shortlistSet = new Set(ids);
  for (const item of evidence) {
    if (!shortlistSet.has(item.contactId)) {
      throw new Error(
        `admin-ai-memory: cohort-scope leak — evidenceId=${item.evidenceId} belongs to contact ${item.contactId} which is not in the shortlist`,
      );
    }
  }

  return { dossiers, evidence };
}
