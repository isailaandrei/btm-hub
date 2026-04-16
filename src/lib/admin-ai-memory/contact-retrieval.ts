/**
 * Contact-scoped memory retrieval.
 *
 * Dossier-first: try the persisted contact dossier; if missing, fall back
 * to raw evidence chunks (the existing FTS path) and flag `fallbackUsed`
 * so the caller can decide whether to surface the degraded mode.
 *
 * Sync-rebuild posture is narrow on purpose — we only pay an OpenAI
 * dossier call on the hot read path when:
 *   - no dossier exists yet, or
 *   - the dossier's generator / schema version is behind the current
 *     code's contract.
 * Soft-staleness (`stale_at` set by the source-mutation triggers) does
 * NOT trigger a sync rebuild. It's a backfill signal — the async
 * `find_stale_admin_ai_contact_memory` RPC + explicit backfill command
 * pick those up without blocking the user's question.
 *
 * The leak assertion mirrors the one in `global-retrieval.ts`: any
 * evidence row whose `contactId` does not match the requested contact is
 * treated as a critical invariant violation.
 */

import {
  listRecentAdminAiEvidence,
  searchAdminAiEvidence,
} from "@/lib/data/admin-ai-retrieval";
import { getContactDossier } from "@/lib/data/admin-ai-memory";
import { rebuildContactMemory } from "./backfill";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import { shouldForceDossierRefreshOnRead } from "./freshness";
import type { EvidenceItem } from "@/types/admin-ai";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";

export const CONTACT_EVIDENCE_LIMIT = 40;

export type ContactScopedMemory = {
  dossier: CrmAiContactDossier | null;
  evidence: EvidenceItem[];
  fallbackUsed: boolean;
};

export async function assembleContactScopedMemory(input: {
  contactId: string;
  question: string;
  textFocus: string[];
}): Promise<ContactScopedMemory> {
  let dossier = await getContactDossier({ contactId: input.contactId });

  const shouldRefresh = shouldForceDossierRefreshOnRead({
    dossier,
    generatorVersion: DOSSIER_GENERATOR_VERSION,
    dossierVersion: DOSSIER_SCHEMA_VERSION,
  });

  if (shouldRefresh) {
    try {
      await rebuildContactMemory({ contactId: input.contactId });
      dossier = await getContactDossier({ contactId: input.contactId });
    } catch {
      // Narrow fallback: if a dossier already exists, keep serving it rather
      // than failing the entire contact analysis on a transient rebuild error.
    }
  }

  const evidence = await searchAdminAiEvidence({
    textFocus: input.textFocus,
    contactId: input.contactId,
    limit: CONTACT_EVIDENCE_LIMIT,
  });
  const resolvedEvidence =
    evidence.length > 0
      ? evidence
      : await listRecentAdminAiEvidence({
          contactId: input.contactId,
          limit: CONTACT_EVIDENCE_LIMIT,
        });

  for (const item of resolvedEvidence) {
    if (item.contactId !== input.contactId) {
      throw new Error(
        `admin-ai-memory: contact-scope leak — expected contactId=${input.contactId}, got ${item.contactId} for evidenceId=${item.evidenceId}`,
      );
    }
  }

  return {
    dossier,
    evidence: resolvedEvidence,
    fallbackUsed: dossier === null,
  };
}
