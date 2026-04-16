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
import { getContactDossier, loadContactCrmSources } from "@/lib/data/admin-ai-memory";
import { buildCurrentCrmChunksForContact } from "./chunk-builder";
import { rebuildContactMemory } from "./backfill";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import {
  computeChunkSourceFingerprint,
  isDossierSoftStale,
  shouldForceDossierRefreshOnRead,
} from "./freshness";
import type { EvidenceItem } from "@/types/admin-ai";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";

export const CONTACT_EVIDENCE_LIMIT = 40;

export type ContactScopedMemory = {
  dossier: CrmAiContactDossier | null;
  evidence: EvidenceItem[];
  fallbackUsed: boolean;
};

async function hasSilentSourceFingerprintDrift(input: {
  contactId: string;
  dossier: CrmAiContactDossier;
}): Promise<boolean> {
  try {
    const sources = await loadContactCrmSources({ contactId: input.contactId });
    if (!sources) return false;

    const chunks = buildCurrentCrmChunksForContact({
      contact: sources.contact,
      applications: sources.applications,
      contactNotes: sources.contactNotes,
    });
    const currentFingerprint = computeChunkSourceFingerprint(chunks);
    return currentFingerprint !== input.dossier.source_fingerprint;
  } catch {
    // This check is defense-in-depth. If it cannot run, prefer serving the
    // current dossier + raw evidence rather than failing the whole answer path.
    return false;
  }
}

export async function assembleContactScopedMemory(input: {
  contactId: string;
  question: string;
  textFocus: string[];
}): Promise<ContactScopedMemory> {
  let dossier = await getContactDossier({ contactId: input.contactId });

  const shouldForceRefresh = shouldForceDossierRefreshOnRead({
    dossier,
    generatorVersion: DOSSIER_GENERATOR_VERSION,
    dossierVersion: DOSSIER_SCHEMA_VERSION,
  });
  const activeDossier = dossier;
  const shouldCheckSilentDrift =
    activeDossier !== null &&
    !shouldForceRefresh &&
    !isDossierSoftStale({ dossier: activeDossier });
  const shouldRefreshForSilentDrift = shouldCheckSilentDrift && activeDossier
    ? await hasSilentSourceFingerprintDrift({
        contactId: input.contactId,
        dossier: activeDossier,
      })
    : false;

  if (shouldForceRefresh || shouldRefreshForSilentDrift) {
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
