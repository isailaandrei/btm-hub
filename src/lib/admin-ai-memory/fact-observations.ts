import { createHash } from "crypto";
import { buildStableChunkId } from "./chunk-identity";
import type {
  CrmAiEvidenceChunkInput,
  CrmAiFactObservationInput,
  CrmAiFactObservationType,
  CrmAiFactObservationValueType,
} from "@/types/admin-ai-memory";

function setVersionNibble(hex: string, version: string): string {
  return `${version}${hex.slice(1)}`;
}

function setVariantNibble(hex: string): string {
  const nibble = parseInt(hex[0]!, 16);
  const withVariant = (nibble & 0x3) | 0x8;
  return `${withVariant.toString(16)}${hex.slice(1)}`;
}

function buildStableFactObservationId(parts: {
  contactId: string;
  observationType: CrmAiFactObservationType;
  fieldKey: string | null;
  valueJson: unknown;
  sourceChunkIds: string[];
}): string {
  const hex = createHash("sha256")
    .update(
      JSON.stringify({
        contactId: parts.contactId,
        observationType: parts.observationType,
        fieldKey: parts.fieldKey,
        valueJson: parts.valueJson,
        sourceChunkIds: [...parts.sourceChunkIds].sort(),
      }),
    )
    .digest("hex")
    .slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    setVersionNibble(hex.slice(12, 16), "5"),
    setVariantNibble(hex.slice(16, 20)),
    hex.slice(20, 32),
  ].join("-");
}

function renderValueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(", ");
  }
  return JSON.stringify(value);
}

function isObservationValueType(
  value: unknown,
): value is CrmAiFactObservationValueType {
  return [
    "string",
    "number",
    "boolean",
    "multiselect",
    "json",
    "tag",
  ].includes(String(value));
}

function buildStructuredFieldObservation(
  chunk: CrmAiEvidenceChunkInput,
  observedAtFallback: string,
): CrmAiFactObservationInput | null {
  const fieldKey =
    typeof chunk.metadata.fieldKey === "string" ? chunk.metadata.fieldKey : null;
  const normalizedValue = chunk.metadata.normalizedValue;
  const valueType = isObservationValueType(chunk.metadata.valueType)
    ? chunk.metadata.valueType
    : "json";

  if (!fieldKey || normalizedValue == null) return null;

  const sourceChunkIds = [
    buildStableChunkId(chunk.sourceType, chunk.sourceId),
  ];

  return {
    id: buildStableFactObservationId({
      contactId: chunk.contactId,
      observationType: "application_field",
      fieldKey,
      valueJson: normalizedValue,
      sourceChunkIds,
    }),
    contactId: chunk.contactId,
    observationType: "application_field",
    fieldKey,
    valueType,
    valueText: renderValueText(normalizedValue),
    valueJson: normalizedValue,
    confidence: "high",
    sourceChunkIds,
    sourceTimestamp: chunk.sourceTimestamp,
    observedAt: chunk.sourceTimestamp ?? observedAtFallback,
    invalidatedAt: null,
    conflictGroup: `application_field:${fieldKey}`,
    metadata: {
      sourceType: chunk.sourceType,
      logicalSourceId: chunk.logicalSourceId,
      sourceId: chunk.sourceId,
      sourceLabel: chunk.metadata.sourceLabel,
      fieldLabel: chunk.metadata.fieldLabel,
      chunkClass: chunk.metadata.chunkClass,
      program: chunk.metadata.program,
      sensitivity: chunk.metadata.sensitivity,
    },
  };
}

function buildTagObservation(
  chunk: CrmAiEvidenceChunkInput,
  observedAtFallback: string,
): CrmAiFactObservationInput | null {
  const tagId =
    typeof chunk.metadata.tagId === "string" ? chunk.metadata.tagId : null;
  const tagName =
    typeof chunk.metadata.tagName === "string" ? chunk.metadata.tagName : null;

  if (!tagId || !tagName) return null;

  const sourceChunkIds = [
    buildStableChunkId(chunk.sourceType, chunk.sourceId),
  ];
  const valueJson = { tagId, tagName };

  return {
    id: buildStableFactObservationId({
      contactId: chunk.contactId,
      observationType: "contact_tag",
      fieldKey: "tag",
      valueJson,
      sourceChunkIds,
    }),
    contactId: chunk.contactId,
    observationType: "contact_tag",
    fieldKey: "tag",
    valueType: "tag",
    valueText: tagName,
    valueJson,
    confidence: "high",
    sourceChunkIds,
    sourceTimestamp: chunk.sourceTimestamp,
    observedAt: chunk.sourceTimestamp ?? observedAtFallback,
    invalidatedAt: null,
    conflictGroup: `contact_tag:${tagId}`,
    metadata: {
      sourceType: chunk.sourceType,
      logicalSourceId: chunk.logicalSourceId,
      sourceId: chunk.sourceId,
      sourceLabel: chunk.metadata.sourceLabel,
      tagId,
      tagName,
      chunkClass: chunk.metadata.chunkClass,
    },
  };
}

export function buildFactObservationsFromChunks(input: {
  chunks: CrmAiEvidenceChunkInput[];
  observedAtFallback?: string;
}): CrmAiFactObservationInput[] {
  const observedAtFallback =
    input.observedAtFallback ?? new Date().toISOString();

  return input.chunks.flatMap((chunk) => {
    switch (chunk.sourceType) {
      case "application_structured_field": {
        const observation = buildStructuredFieldObservation(
          chunk,
          observedAtFallback,
        );
        return observation ? [observation] : [];
      }
      case "contact_tag": {
        const observation = buildTagObservation(chunk, observedAtFallback);
        return observation ? [observation] : [];
      }
      default:
        return [];
    }
  });
}
