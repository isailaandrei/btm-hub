/**
 * Admin AI Analyst — retrieval orchestration.
 *
 * Glues the deterministic `buildAdminAiQueryPlan` output to the two
 * data-layer helpers (`queryAdminAiContactFacts`, `searchAdminAiEvidence`)
 * and enforces the Phase 1 caps:
 *
 *   - MAX_CANDIDATES  = 25   contacts sent into synthesis
 *   - MAX_SHORTLIST   = 10   product-level cap applied by the UI / prompt;
 *                            we surface all 25 candidates here and let the
 *                            synthesis layer + UI apply the final shortlist.
 *                            Rationale: the prompt still benefits from seeing
 *                            the longer list when reasoning about cohort-
 *                            level questions; callers that only need the
 *                            shortlist can `candidates.slice(0, 10)`.
 *   - MAX_EVIDENCE    = 40   evidence rows forwarded to the provider.
 *   - MAX_SNIPPET_CHARS = 500  per-evidence character cap; truncated snippets
 *                              receive an ellipsis.
 *
 * Contact-scope leakage: when `plan.mode === "contact_synthesis"` and a
 * `contactId` is set, the pipeline forwards the contact ID to BOTH the
 * facts query and the evidence RPC, and performs a final assertion that no
 * evidence row escaped the filter. A leak is treated as a critical invariant
 * violation and throws.
 */

import {
  queryAdminAiContactFacts,
  searchAdminAiEvidence,
} from "@/lib/data/admin-ai-retrieval";
import type {
  AdminAiQueryPlan,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";

export const MAX_CANDIDATES = 25;
export const MAX_SHORTLIST = 10;
export const MAX_EVIDENCE = 40;
export const MAX_SNIPPET_CHARS = 500;

export type AssembledEvidence = {
  candidates: ContactFactRow[];
  evidence: EvidenceItem[];
  insufficientEvidence: boolean;
};

export async function assembleAdminAiEvidence(input: {
  plan: AdminAiQueryPlan;
}): Promise<AssembledEvidence> {
  const { plan } = input;
  const factsLimit =
    plan.mode === "contact_synthesis"
      ? MAX_CANDIDATES
      : Math.min(plan.requestedLimit, MAX_CANDIDATES);

  // 1. Fetch candidate contact facts. The facts query already respects
  //    plan.structuredFilters and plan.contactId; we cap the returned rows
  //    at MAX_CANDIDATES defensively — the data layer applies plan.requestedLimit
  //    which the planner already bounds.
  const rawCandidates = await queryAdminAiContactFacts({
    filters: plan.structuredFilters,
    contactId: plan.contactId,
    limit: factsLimit,
  });
  const candidates = rawCandidates.slice(0, MAX_CANDIDATES);

  // 2. Derive unique contact IDs. A single contact may have multiple
  //    application rows in the facts view, so we dedupe before passing to
  //    evidence search.
  const contactIdSet = new Set<string>();
  for (const row of candidates) {
    if (row.contact_id) contactIdSet.add(row.contact_id);
  }
  const derivedContactIds = Array.from(contactIdSet);

  // 3. Fetch evidence. In global mode we pass the derived candidate IDs to
  //    focus the search; in contact mode we pass contactId directly (the
  //    RPC treats contactId as an exclusive filter).
  const rawEvidence = await searchAdminAiEvidence({
    textFocus: plan.textFocus,
    contactIds:
      plan.mode === "contact_synthesis"
        ? undefined
        : derivedContactIds.length > 0
          ? derivedContactIds
          : undefined,
    contactId: plan.contactId,
    limit: MAX_EVIDENCE,
  });

  // 4. Dedupe by evidenceId. Belt-and-suspenders — the RPC should already
  //    emit unique rows, but a SQL change could silently regress.
  const seenIds = new Set<string>();
  const deduped: EvidenceItem[] = [];
  for (const item of rawEvidence) {
    if (seenIds.has(item.evidenceId)) continue;
    seenIds.add(item.evidenceId);
    deduped.push(item);
    if (deduped.length >= MAX_EVIDENCE) break;
  }

  // 5. Truncate snippets. We append a single ellipsis character when the
  //    snippet is actually shortened so downstream consumers (prompt /
  //    citations UI) can reason about whether they have the full text.
  const evidence: EvidenceItem[] = deduped.map((item) => {
    if (item.text.length <= MAX_SNIPPET_CHARS) return item;
    return {
      ...item,
      text: `${item.text.slice(0, MAX_SNIPPET_CHARS - 1)}\u2026`,
    };
  });

  // 6. Contact-scope leakage assertion. A critical invariant: when the plan
  //    is contact-scoped, every evidence row MUST belong to that contact.
  if (plan.mode === "contact_synthesis" && plan.contactId) {
    for (const item of evidence) {
      if (item.contactId !== plan.contactId) {
        throw new Error(
          `admin-ai: contact-scope leak — expected contactId=${plan.contactId}, got ${item.contactId} for evidenceId=${item.evidenceId}`,
        );
      }
    }
  }

  const insufficientEvidence =
    candidates.length === 0 && evidence.length === 0;

  return {
    candidates,
    evidence,
    insufficientEvidence,
  };
}
