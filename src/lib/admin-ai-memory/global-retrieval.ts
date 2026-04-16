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
  listRecentAdminAiEvidence,
  queryAdminAiContactFacts,
  searchAdminAiEvidence,
} from "@/lib/data/admin-ai-retrieval";
import {
  listContactDossierStates,
  listContactDossiers,
  listRankingCards,
} from "@/lib/data/admin-ai-memory";
import { rebuildContactMemory } from "./backfill";
import {
  findContactsNeedingMemoryRefresh,
} from "./freshness";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
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
export const MAX_SYNC_MEMORY_REFRESHES = 5;

export type GlobalCohortMemory = {
  candidates: ContactFactRow[];
  rankingCards: CrmAiContactRankingCard[];
  contactsMissingRankingCards: string[];
};

export async function assembleGlobalCohortMemory(input: {
  plan: AdminAiQueryPlan;
}): Promise<GlobalCohortMemory> {
  const { plan } = input;
  const rawCandidates = await queryAdminAiContactFacts({
    filters: plan.structuredFilters,
    limit: MAX_RANKING_COHORT,
  });
  const candidates = rawCandidates.slice(0, MAX_RANKING_COHORT);

  const contactIds = Array.from(
    new Set(candidates.map((c) => c.contact_id).filter(Boolean) as string[]),
  );

  let rankingCards = contactIds.length
    ? await listRankingCards({
        contactIds,
        limit: MAX_RANKING_COHORT,
      })
    : [];

  const dossierStates = contactIds.length
    ? await listContactDossierStates({ contactIds })
    : [];

  const contactsNeedingRefresh = findContactsNeedingMemoryRefresh({
    contactIds,
    dossiers: dossierStates,
    rankingCards,
    generatorVersion: DOSSIER_GENERATOR_VERSION,
  });

  const unresolvedRefreshSet = new Set<string>();
  if (
    contactsNeedingRefresh.length > 0 &&
    contactsNeedingRefresh.length <= MAX_SYNC_MEMORY_REFRESHES
  ) {
    await Promise.all(
      contactsNeedingRefresh.map(async (contactId) => {
        try {
          await rebuildContactMemory({ contactId });
        } catch {
          unresolvedRefreshSet.add(contactId);
        }
      }),
    );

    rankingCards = await listRankingCards({
      contactIds,
      limit: MAX_RANKING_COHORT,
    });
  } else {
    for (const contactId of contactsNeedingRefresh) {
      unresolvedRefreshSet.add(contactId);
    }
  }

  const candidateOrder = new Map(
    contactIds.map((contactId, index) => [contactId, index] as const),
  );
  const validRankingCards = rankingCards
    .filter(
      (card) => !unresolvedRefreshSet.has(card.contact_id),
    )
    .sort(
      (a, b) =>
        (candidateOrder.get(a.contact_id) ?? Number.MAX_SAFE_INTEGER) -
        (candidateOrder.get(b.contact_id) ?? Number.MAX_SAFE_INTEGER),
    );
  const cardContactIds = new Set(validRankingCards.map((c) => c.contact_id));
  const contactsMissingRankingCards = contactIds.filter(
    (id) => unresolvedRefreshSet.has(id) || !cardContactIds.has(id),
  );

  return {
    candidates,
    rankingCards: validRankingCards,
    contactsMissingRankingCards,
  };
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
  const resolvedEvidence =
    evidence.length > 0
      ? evidence
      : await listRecentAdminAiEvidence({
          contactIds: ids,
          limit: MAX_FINALIST_EVIDENCE,
        });

  // Defense-in-depth: any evidence row outside the shortlist is a leak.
  const shortlistSet = new Set(ids);
  for (const item of resolvedEvidence) {
    if (!shortlistSet.has(item.contactId)) {
      throw new Error(
        `admin-ai-memory: cohort-scope leak — evidenceId=${item.evidenceId} belongs to contact ${item.contactId} which is not in the shortlist`,
      );
    }
  }

  return { dossiers, evidence: resolvedEvidence };
}
