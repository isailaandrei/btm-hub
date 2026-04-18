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

import { after } from "next/server";
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
import { areAiRebuildsDisabled } from "./ai-rebuild-guard";
import { rebuildContactMemory } from "./backfill";
import {
  findContactsNeedingMemoryRefresh,
} from "./freshness";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
  QueryMatchingChunk,
} from "@/types/admin-ai-memory";

export const MAX_RANKING_COHORT = 250;
export const MAX_FINALIST_EVIDENCE = 60;
export const MAX_BACKGROUND_MEMORY_REFRESHES = 1;
/**
 * Total FTS hits attached across all ranking cards at query time. 80
 * chunks × ~300 chars ≈ 24KB (~6K tokens) added to the ranking
 * prompt — keeps cost bounded while giving the ranker a raw-text
 * shortcut on keyword-specific queries.
 */
export const MAX_QUERY_MATCH_CHUNKS = 80;
/** Per-contact cap so one chunk-dense contact doesn't crowd the prompt. */
export const MAX_QUERY_MATCH_CHUNKS_PER_CONTACT = 2;
/** Per-chunk char cap for ranking-prompt inclusion. */
export const QUERY_MATCH_CHUNK_MAX_CHARS = 300;

export type GlobalCohortMemory = {
  candidates: ContactFactRow[];
  rankingCards: CrmAiContactRankingCard[];
  contactsMissingRankingCards: string[];
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

export async function assembleGlobalCohortMemory(input: {
  plan: AdminAiQueryPlan;
}): Promise<GlobalCohortMemory> {
  const { plan } = input;
  const candidates = await queryAdminAiContactFacts({
    filters: plan.structuredFilters,
    limit: MAX_RANKING_COHORT,
  });

  const contactIds = Array.from(
    new Set(candidates.map((c) => c.contact_id).filter(Boolean) as string[]),
  );

  const rankingCards = contactIds.length
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
    dossierVersion: DOSSIER_SCHEMA_VERSION,
  });

  if (contactsNeedingRefresh.length > 0) {
    scheduleBackgroundMemoryRefresh(contactsNeedingRefresh);
  }
  const contactsNeedingRefreshSet = new Set(contactsNeedingRefresh);

  const candidateOrder = new Map(
    contactIds.map((contactId, index) => [contactId, index] as const),
  );
  const validRankingCards = rankingCards.toSorted(
    (a, b) =>
      (candidateOrder.get(a.contact_id) ?? Number.MAX_SAFE_INTEGER) -
      (candidateOrder.get(b.contact_id) ?? Number.MAX_SAFE_INTEGER),
  );
  const cardContactIds = new Set(validRankingCards.map((c) => c.contact_id));
  const contactsMissingRankingCards = contactIds.filter(
    (id) => contactsNeedingRefreshSet.has(id) || !cardContactIds.has(id),
  );

  // Query-time raw-chunk enrichment. Dossier summaries are lossy —
  // keywords like organization names or programs get abstracted away
  // during dossier generation. Running FTS with the question's
  // textFocus directly over chunks gives the ranker a literal-text
  // shortcut so keyword-specific queries still surface the right
  // contacts even when their dossiers have dropped the keyword.
  if (plan.textFocus.length > 0 && validRankingCards.length > 0) {
    await attachQueryMatchingChunksToCards({
      textFocus: plan.textFocus,
      cards: validRankingCards,
    });
  }

  return {
    candidates,
    rankingCards: validRankingCards,
    contactsMissingRankingCards,
  };
}

function truncateQueryChunk(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}\u2026`;
}

async function attachQueryMatchingChunksToCards(input: {
  textFocus: string[];
  cards: CrmAiContactRankingCard[];
}): Promise<void> {
  const contactIds = input.cards.map((card) => card.contact_id);
  if (contactIds.length === 0) return;

  let hits: EvidenceItem[] = [];
  try {
    const result = await searchAdminAiEvidence({
      textFocus: input.textFocus,
      contactIds,
      limit: MAX_QUERY_MATCH_CHUNKS,
    });
    hits = Array.isArray(result) ? result : [];
  } catch (error) {
    // FTS is a best-effort enrichment; ranking still works with
    // dossier summaries alone if the RPC fails.
    console.warn(
      "[admin-ai-memory] query-matching chunk enrichment failed",
      { error: error instanceof Error ? error.message : String(error) },
    );
    return;
  }
  if (hits.length === 0) return;

  const byContact = new Map<string, QueryMatchingChunk[]>();
  for (const hit of hits) {
    const existing = byContact.get(hit.contactId) ?? [];
    if (existing.length >= MAX_QUERY_MATCH_CHUNKS_PER_CONTACT) continue;
    existing.push({
      text: truncateQueryChunk(hit.text, QUERY_MATCH_CHUNK_MAX_CHARS),
      sourceLabel: hit.sourceLabel,
      sourceType: hit.sourceType,
    });
    byContact.set(hit.contactId, existing);
  }

  for (const card of input.cards) {
    const matches = byContact.get(card.contact_id);
    if (matches && matches.length > 0) {
      card.queryMatchingChunks = matches;
    }
  }
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
