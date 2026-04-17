/**
 * Zod schemas describing the shapes the chunk builder + dossier generator
 * exchange. These are validation seams for boundaries — they are NOT the
 * persistence contract (that lives in `@/types/admin-ai-memory`).
 *
 * The chunk-input schema is permissive about metadata so source-specific
 * connectors can stash arbitrary provenance fields without us widening the
 * shape every time.
 */

import { z } from "zod";
import { CHUNK_SOURCE_TYPES } from "./source-types";

const sourceTypeEnum = z.enum([
  CHUNK_SOURCE_TYPES.applicationAnswer,
  CHUNK_SOURCE_TYPES.contactNote,
  CHUNK_SOURCE_TYPES.applicationAdminNote,
  CHUNK_SOURCE_TYPES.whatsappMessage,
  CHUNK_SOURCE_TYPES.instagramMessage,
  CHUNK_SOURCE_TYPES.zoomTranscriptChunk,
]);

export const chunkInputSchema = z.object({
  contactId: z.string().min(1),
  applicationId: z.string().min(1).nullable(),
  sourceType: sourceTypeEnum,
  sourceId: z.string().min(1),
  sourceTimestamp: z.string().min(1).nullable(),
  text: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  contentHash: z.string().min(1),
  chunkVersion: z.number().int().min(1),
});

export type ChunkInputSchema = z.infer<typeof chunkInputSchema>;

/**
 * Compact chunk projection used by the dossier prompt. Carries the chunk id
 * and text plus enough provenance metadata for the model to reference it,
 * without dumping raw DB columns into the prompt.
 */
export const dossierChunkSchema = z.object({
  chunkId: z.string().min(1),
  sourceType: sourceTypeEnum,
  sourceLabel: z.string().min(1),
  sourceTimestamp: z.string().nullable(),
  text: z.string().min(1),
});

export type DossierChunkInput = z.infer<typeof dossierChunkSchema>;
