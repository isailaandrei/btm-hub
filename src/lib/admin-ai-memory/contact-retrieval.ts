/**
 * Contact-scoped memory retrieval.
 *
 * Dossier-first: try the persisted contact dossier; if missing, fall back
 * to raw evidence chunks (the existing FTS path) and flag `fallbackUsed`
 * so the caller can decide whether to surface the degraded mode.
 *
 * The leak assertion mirrors the one in `src/lib/admin-ai/retrieval.ts`:
 * any evidence row whose `contactId` does not match the requested contact
 * is treated as a critical invariant violation.
 */

import {
  listRecentAdminAiEvidence,
  searchAdminAiEvidence,
} from "@/lib/data/admin-ai-retrieval";
import { getContactDossier } from "@/lib/data/admin-ai-memory";
import { rebuildContactMemory } from "./backfill";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
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

  const shouldRefresh =
    dossier === null ||
    dossier.generator_version !== DOSSIER_GENERATOR_VERSION ||
    (dossier.stale_at !== null &&
      new Date(dossier.stale_at).getTime() <= Date.now());

  if (shouldRefresh) {
    await rebuildContactMemory({ contactId: input.contactId });
    dossier = await getContactDossier({ contactId: input.contactId });
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
