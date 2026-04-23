import { createHash } from "crypto";
import type { CrmAiChunkSourceType } from "@/types/admin-ai-memory";

function setVersionNibble(hex: string, version: string): string {
  return `${version}${hex.slice(1)}`;
}

function setVariantNibble(hex: string): string {
  const nibble = parseInt(hex[0]!, 16);
  const withVariant = (nibble & 0x3) | 0x8;
  return `${withVariant.toString(16)}${hex.slice(1)}`;
}

function buildStableUuid(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32);

  const part1 = hex.slice(0, 8);
  const part2 = hex.slice(8, 12);
  const part3 = setVersionNibble(hex.slice(12, 16), "5");
  const part4 = setVariantNibble(hex.slice(16, 20));
  const part5 = hex.slice(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

export function buildStableChunkId(
  sourceType: CrmAiChunkSourceType,
  sourceId: string,
): string {
  return buildStableUuid(`${sourceType}:${sourceId}`);
}

export function buildStableSubchunkId(
  parentChunkId: string,
  subchunkIndex: number,
): string {
  return buildStableUuid(`subchunk:${parentChunkId}:${subchunkIndex}`);
}
