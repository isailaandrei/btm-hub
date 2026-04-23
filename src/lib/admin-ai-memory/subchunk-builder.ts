import { createHash } from "crypto";
import { buildStableChunkId, buildStableSubchunkId } from "./chunk-identity";
import type {
  CrmAiEvidenceChunkInput,
  CrmAiEvidenceSubchunkInput,
} from "@/types/admin-ai-memory";

export const DEFAULT_SUBCHUNK_MAX_TOKENS = 180;
export const DEFAULT_SUBCHUNK_OVERLAP_TOKENS = 24;

function hashContent(parts: Array<string | number | null | undefined>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(part ?? ""));
    hash.update("\u0001");
  }
  return hash.digest("hex");
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter((token) => token.length > 0);
}

export function estimateWhitespaceTokens(text: string): number {
  return tokenize(text).length;
}

function chunkNeedsSplitting(
  chunk: CrmAiEvidenceChunkInput,
  tokenCount: number,
  maxTokens: number,
): boolean {
  if (tokenCount <= maxTokens) return false;
  return chunk.sourceType === "application_answer"
    || chunk.sourceType === "contact_note"
    || chunk.sourceType === "application_admin_note"
    || chunk.sourceType === "zoom_transcript_chunk"
    || chunk.sourceType === "whatsapp_message"
    || chunk.sourceType === "instagram_message";
}

function buildSubchunkMetadata(
  chunk: CrmAiEvidenceChunkInput,
  tokenEstimate: number,
): Record<string, unknown> {
  return {
    sourceType: chunk.sourceType,
    sourceLabel:
      typeof chunk.metadata.sourceLabel === "string"
        ? chunk.metadata.sourceLabel
        : chunk.sourceType,
    fieldKey:
      typeof chunk.metadata.fieldKey === "string"
        ? chunk.metadata.fieldKey
        : null,
    fieldLabel:
      typeof chunk.metadata.fieldLabel === "string"
        ? chunk.metadata.fieldLabel
        : null,
    program:
      typeof chunk.metadata.program === "string"
        ? chunk.metadata.program
        : null,
    chunkClass:
      typeof chunk.metadata.chunkClass === "string"
        ? chunk.metadata.chunkClass
        : null,
    sensitivity:
      typeof chunk.metadata.sensitivity === "string"
        ? chunk.metadata.sensitivity
        : null,
    tokenEstimate,
  };
}

function buildSingleSubchunk(
  chunk: CrmAiEvidenceChunkInput,
): CrmAiEvidenceSubchunkInput {
  const parentChunkId = buildStableChunkId(chunk.sourceType, chunk.sourceId);
  const tokenEstimate = estimateWhitespaceTokens(chunk.text);
  return {
    id: buildStableSubchunkId(parentChunkId, 0),
    parentChunkId,
    contactId: chunk.contactId,
    applicationId: chunk.applicationId,
    subchunkIndex: 0,
    text: chunk.text,
    contentHash: hashContent([parentChunkId, 0, chunk.text]),
    tokenEstimate,
    metadata: buildSubchunkMetadata(chunk, tokenEstimate),
  };
}

export function buildEvidenceSubchunks(input: {
  chunks: CrmAiEvidenceChunkInput[];
  maxTokens?: number;
  overlapTokens?: number;
}): CrmAiEvidenceSubchunkInput[] {
  const maxTokens = input.maxTokens ?? DEFAULT_SUBCHUNK_MAX_TOKENS;
  const overlapTokens = Math.max(
    0,
    Math.min(input.overlapTokens ?? DEFAULT_SUBCHUNK_OVERLAP_TOKENS, maxTokens - 1),
  );
  const subchunks: CrmAiEvidenceSubchunkInput[] = [];

  for (const chunk of input.chunks) {
    const tokens = tokenize(chunk.text);
    if (!chunkNeedsSplitting(chunk, tokens.length, maxTokens)) {
      subchunks.push(buildSingleSubchunk(chunk));
      continue;
    }

    const parentChunkId = buildStableChunkId(chunk.sourceType, chunk.sourceId);
    const step = Math.max(1, maxTokens - overlapTokens);
    let subchunkIndex = 0;

    for (let start = 0; start < tokens.length; start += step) {
      const slice = tokens.slice(start, start + maxTokens);
      if (slice.length === 0) continue;
      const text = slice.join(" ");
      const tokenEstimate = slice.length;
      subchunks.push({
        id: buildStableSubchunkId(parentChunkId, subchunkIndex),
        parentChunkId,
        contactId: chunk.contactId,
        applicationId: chunk.applicationId,
        subchunkIndex,
        text,
        contentHash: hashContent([parentChunkId, subchunkIndex, text]),
        tokenEstimate,
        metadata: buildSubchunkMetadata(chunk, tokenEstimate),
      });
      subchunkIndex += 1;
      if (start + maxTokens >= tokens.length) break;
    }
  }

  return subchunks;
}

export function buildEmbeddingContentForSubchunk(input: {
  parentChunk: CrmAiEvidenceChunkInput;
  subchunk: CrmAiEvidenceSubchunkInput;
}): string {
  const lines = [
    `Source type: ${input.parentChunk.sourceType}`,
    `Source label: ${
      typeof input.parentChunk.metadata.sourceLabel === "string"
        ? input.parentChunk.metadata.sourceLabel
        : input.parentChunk.sourceType
    }`,
  ];

  if (typeof input.parentChunk.metadata.program === "string") {
    lines.push(`Program: ${input.parentChunk.metadata.program}`);
  }
  if (typeof input.parentChunk.metadata.fieldKey === "string") {
    lines.push(`Field key: ${input.parentChunk.metadata.fieldKey}`);
  }
  if (typeof input.parentChunk.metadata.fieldLabel === "string") {
    lines.push(`Field label: ${input.parentChunk.metadata.fieldLabel}`);
  }
  if (typeof input.parentChunk.metadata.sensitivity === "string") {
    lines.push(`Sensitivity: ${input.parentChunk.metadata.sensitivity}`);
  }

  lines.push(`Content: ${input.subchunk.text}`);
  return lines.join("\n");
}
