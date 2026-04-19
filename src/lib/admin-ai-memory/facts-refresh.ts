/**
 * Deterministic refresh of the structural slice of the memory layer.
 *
 * Runs on every admin write that touches tags, notes, or structural
 * contact fields. No OpenAI call — we only touch the parts of the
 * dossier that are pure projections of the source data:
 *
 *   - Evidence chunks (delete stale + upsert current).
 *   - Dossier `facts_json` (via `buildDossierContactFacts`) + `stale_at`
 *     stamp so the next AI-involving read knows the interpretive fields
 *     may lag.
 *
 * Signals, evidence anchors, contradictions, unknowns, and summaries
 * are NOT touched here — those still come from the dossier generator
 * and only refresh on backfill or version drift.
 *
 * Must stay fast. Admins call this from server actions inline with
 * their tag/note writes. Three cheap Supabase reads + one write,
 * typically ~100ms end-to-end.
 */

import { buildCurrentCrmChunksForContact } from "./chunk-builder";
import { buildDossierContactFacts } from "./contact-facts";
import {
  deleteStaleCurrentCrmEvidenceChunksForContact,
  getContactDossier,
  loadContactCrmSources,
  patchContactDossierStructural,
  upsertEvidenceChunks,
} from "@/lib/data/admin-ai-memory";
import { queryAdminAiContactFacts } from "@/lib/data/admin-ai-retrieval";

export type FactsRefreshStatus =
  | "refreshed"
  | "no_dossier"
  | "missing_sources";

export type FactsRefreshResult = {
  contactId: string;
  status: FactsRefreshStatus;
  chunkCount: number;
  dossierPatched: boolean;
};

export async function refreshContactMemoryFacts(input: {
  contactId: string;
}): Promise<FactsRefreshResult> {
  const sources = await loadContactCrmSources({ contactId: input.contactId });
  if (!sources) {
    return {
      contactId: input.contactId,
      status: "missing_sources",
      chunkCount: 0,
      dossierPatched: false,
    };
  }

  // 1. Sync chunks. Text-field changes produce new content_hash values
  //    → in-place update. Deleted rows get their chunks pruned.
  const chunks = buildCurrentCrmChunksForContact({
    contact: sources.contact,
    applications: sources.applications,
    contactNotes: sources.contactNotes,
  });
  const retainedSourceKeys = chunks.map(
    (chunk) => `${chunk.sourceType}:${chunk.sourceId}`,
  );
  await deleteStaleCurrentCrmEvidenceChunksForContact({
    contactId: input.contactId,
    retainedSourceKeys,
  });
  if (chunks.length > 0) {
    await upsertEvidenceChunks({ chunks });
  }

  // 2. If there's no dossier yet, we've done everything we can without
  //    the AI. The next backfill will build the dossier from the now-
  //    current chunks.
  const dossier = await getContactDossier({ contactId: input.contactId });
  if (!dossier) {
    return {
      contactId: input.contactId,
      status: "no_dossier",
      chunkCount: chunks.length,
      dossierPatched: false,
    };
  }

  // 3. Rebuild the structural facts.
  const factRows = await queryAdminAiContactFacts({
    filters: [],
    contactId: input.contactId,
    limit: 100,
  });
  const facts = buildDossierContactFacts({
    contact: sources.contact,
    factRows,
    applicationCount: sources.applications.length,
  });

  // 4. Patch the dossier: fresh facts, stale_at stamped. Interpretive
  //    fields untouched.
  await patchContactDossierStructural({
    contactId: input.contactId,
    facts,
    staleAt: new Date().toISOString(),
  });

  return {
    contactId: input.contactId,
    status: "refreshed",
    chunkCount: chunks.length,
    dossierPatched: true,
  };
}
