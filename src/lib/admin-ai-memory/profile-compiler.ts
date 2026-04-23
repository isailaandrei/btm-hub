import type { CrmAiEvidenceChunkInput, CrmAiFactObservation } from "@/types/admin-ai-memory";
import type { Application, Contact } from "@/types/database";

type CompiledObservationHistoryEntry = {
  valueText: string;
  valueJson: unknown;
  observedAt: string;
  sourceTimestamp: string | null;
  confidence: string;
  fieldLabel: string | null;
};

type CompiledTagHistoryEntry = {
  tagId: string | null;
  tagName: string;
  observedAt: string;
  sourceTimestamp: string | null;
  confidence: string;
};

export type CompiledContactProfileFacts = {
  contact: {
    contactId: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  applications: {
    applicationCount: number;
    applicationIds: string[];
    programHistory: string[];
    statusHistory: string[];
  };
  tags: {
    tagIds: string[];
    tagNames: string[];
    observedTagIds: string[];
    observedTagNames: string[];
  };
  structuredFieldDetails: Record<string, {
    fieldLabel: string | null;
    valueType: string | null;
    rawValues: string[];
    normalizedValues: string[];
  }>;
  observationSummary: {
    fieldHistory: Record<string, CompiledObservationHistoryEntry[]>;
    conflictingFields: string[];
    tagHistory: CompiledTagHistoryEntry[];
  };
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function renderNormalizedValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry)))
      .filter((entry) => entry.length > 0);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (value == null) return null;
  return JSON.stringify(value);
}

function compareIsoDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function compileContactProfileFacts(input: {
  contact: Contact;
  applications: Application[];
  currentChunks: CrmAiEvidenceChunkInput[];
  observations: CrmAiFactObservation[];
}): CompiledContactProfileFacts {
  const currentStructuredFieldValues = new Map<string, string[]>();
  const currentStructuredFieldRawValues = new Map<string, string[]>();
  const structuredFieldDetailsMeta = new Map<string, {
    fieldLabel: string | null;
    valueType: string | null;
  }>();

  for (const chunk of input.currentChunks) {
    if (chunk.sourceType !== "application_structured_field") continue;
    const fieldKey =
      typeof chunk.metadata.fieldKey === "string" ? chunk.metadata.fieldKey : null;
    const rendered = renderNormalizedValue(chunk.metadata.normalizedValue);
    const rawRendered = renderNormalizedValue(
      "displayValue" in chunk.metadata
        ? chunk.metadata.displayValue
        : chunk.metadata.normalizedValue,
    );
    if (!fieldKey || !rendered) continue;
    currentStructuredFieldValues.set(fieldKey, uniqueStrings([
      ...(currentStructuredFieldValues.get(fieldKey) ?? []),
      rendered,
    ]));
    currentStructuredFieldRawValues.set(fieldKey, uniqueStrings([
      ...(currentStructuredFieldRawValues.get(fieldKey) ?? []),
      rawRendered ?? rendered,
    ]));
    structuredFieldDetailsMeta.set(fieldKey, {
      fieldLabel:
        typeof chunk.metadata.fieldLabel === "string"
          ? chunk.metadata.fieldLabel
          : null,
      valueType:
        typeof chunk.metadata.valueType === "string"
          ? chunk.metadata.valueType
          : null,
    });
  }

  const currentTagIdByName = new Map<string, string>();
  for (const chunk of input.currentChunks) {
    if (chunk.sourceType !== "contact_tag") continue;
    const tagId =
      typeof chunk.metadata.tagId === "string" ? chunk.metadata.tagId : null;
    const tagName =
      typeof chunk.metadata.tagName === "string" ? chunk.metadata.tagName : null;
    if (!tagId || !tagName) continue;
    currentTagIdByName.set(tagName, tagId);
  }

  const fieldHistory = new Map<string, CompiledObservationHistoryEntry[]>();
  const fieldDistinctValueKeys = new Map<string, Set<string>>();
  const tagHistory: CompiledTagHistoryEntry[] = [];

  for (const observation of input.observations) {
    if (observation.observation_type === "application_field") {
      const fieldKey = observation.field_key;
      if (!fieldKey) continue;

      const entry: CompiledObservationHistoryEntry = {
        valueText: observation.value_text,
        valueJson: observation.value_json,
        observedAt: observation.observed_at,
        sourceTimestamp: observation.source_timestamp,
        confidence: observation.confidence,
        fieldLabel:
          typeof observation.metadata_json.fieldLabel === "string"
            ? observation.metadata_json.fieldLabel
            : null,
      };

      const entries = fieldHistory.get(fieldKey) ?? [];
      entries.push(entry);
      fieldHistory.set(fieldKey, entries);

      const distinct = fieldDistinctValueKeys.get(fieldKey) ?? new Set<string>();
      distinct.add(JSON.stringify(observation.value_json));
      fieldDistinctValueKeys.set(fieldKey, distinct);
      continue;
    }

    if (observation.observation_type === "contact_tag") {
      const rawValue = observation.value_json;
      const tagId =
        rawValue &&
        typeof rawValue === "object" &&
        "tagId" in rawValue &&
        typeof rawValue.tagId === "string"
          ? rawValue.tagId
          : typeof observation.metadata_json.tagId === "string"
            ? observation.metadata_json.tagId
            : null;
      const tagName =
        rawValue &&
        typeof rawValue === "object" &&
        "tagName" in rawValue &&
        typeof rawValue.tagName === "string"
          ? rawValue.tagName
          : typeof observation.metadata_json.tagName === "string"
            ? observation.metadata_json.tagName
            : observation.value_text;

      if (!tagName) continue;

      tagHistory.push({
        tagId,
        tagName,
        observedAt: observation.observed_at,
        sourceTimestamp: observation.source_timestamp,
        confidence: observation.confidence,
      });
    }
  }

  for (const entries of fieldHistory.values()) {
    entries.sort((a, b) => compareIsoDesc(a.observedAt, b.observedAt));
  }
  tagHistory.sort((a, b) => compareIsoDesc(a.observedAt, b.observedAt));

  const structuredFieldDetails = Object.fromEntries(
    Array.from(currentStructuredFieldValues.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fieldKey, normalizedValues]) => [
        fieldKey,
        {
          ...(structuredFieldDetailsMeta.get(fieldKey) ?? {
            fieldLabel: null,
            valueType: null,
          }),
          rawValues: currentStructuredFieldRawValues.get(fieldKey) ?? [],
          normalizedValues,
        },
      ]),
  );

  const conflictingFields = Array.from(fieldDistinctValueKeys.entries())
    .filter(([, distinctValues]) => distinctValues.size > 1)
    .map(([fieldKey]) => fieldKey)
    .sort((a, b) => a.localeCompare(b));

  const observedTagNames = uniqueStrings(tagHistory.map((entry) => entry.tagName));
  const observedTagIds = uniqueStrings(
    tagHistory.map((entry) => entry.tagId ?? undefined),
  );

  return {
    contact: {
      contactId: input.contact.id,
      contactName: input.contact.name,
      contactEmail: input.contact.email,
      contactPhone: input.contact.phone,
    },
    applications: {
      applicationCount: input.applications.length,
      applicationIds: uniqueStrings(input.applications.map((app) => app.id)),
      programHistory: uniqueStrings(input.applications.map((app) => app.program)),
      statusHistory: uniqueStrings(input.applications.map((app) => app.status)),
    },
    tags: {
      tagIds: uniqueStrings(Array.from(currentTagIdByName.values())),
      tagNames: uniqueStrings(Array.from(currentTagIdByName.keys())),
      observedTagIds,
      observedTagNames,
    },
    structuredFieldDetails,
    observationSummary: {
      fieldHistory: Object.fromEntries(
        Array.from(fieldHistory.entries()).sort(([a], [b]) => a.localeCompare(b)),
      ),
      conflictingFields,
      tagHistory,
    },
  };
}
