import { describe, expect, it } from "vitest";
import { buildStableChunkId } from "./chunk-identity";
import { buildFactObservationsFromChunks } from "./fact-observations";
import type { CrmAiEvidenceChunkInput } from "@/types/admin-ai-memory";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeStructuredChunk(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: APP_ID,
    sourceType: "application_structured_field",
    logicalSourceId: `${APP_ID}:sf:budget`,
    sourceId: `${APP_ID}:sf:budget:v:budget-medium`,
    sourceTimestamp: "2026-04-10T00:00:00Z",
    text: "Application field: Budget. Candidate reports $2,000 - $5,000.",
    metadata: {
      sourceLabel: "Budget",
      fieldKey: "budget",
      fieldLabel: "Budget",
      normalizedValue: "$2,000 - $5,000",
      valueType: "string",
      chunkClass: "structured_field",
      sensitivity: "default",
      program: "filmmaking",
    },
    contentHash: "chunk-hash",
    chunkVersion: 1,
    ...overrides,
  };
}

function makeTagChunk(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: null,
    sourceType: "contact_tag",
    logicalSourceId: `${CONTACT_ID}:tag:tag-1`,
    sourceId: `${CONTACT_ID}:tag:tag-1:v:conservation`,
    sourceTimestamp: "2026-04-11T00:00:00Z",
    text: "CRM tag: Conservation.",
    metadata: {
      sourceLabel: "CRM tag",
      tagId: "tag-1",
      tagName: "Conservation",
      chunkClass: "tag",
    },
    contentHash: "tag-hash",
    chunkVersion: 1,
    ...overrides,
  };
}

describe("buildFactObservationsFromChunks", () => {
  it("extracts a direct application-field observation from a structured chunk", () => {
    const chunk = makeStructuredChunk();

    const observations = buildFactObservationsFromChunks({ chunks: [chunk] });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      contactId: CONTACT_ID,
      observationType: "application_field",
      fieldKey: "budget",
      valueType: "string",
      valueText: "$2,000 - $5,000",
      valueJson: "$2,000 - $5,000",
      confidence: "high",
      sourceChunkIds: [
        buildStableChunkId("application_structured_field", chunk.sourceId),
      ],
      sourceTimestamp: "2026-04-10T00:00:00Z",
      observedAt: "2026-04-10T00:00:00Z",
      invalidatedAt: null,
      conflictGroup: "application_field:budget",
      metadata: expect.objectContaining({
        sourceType: "application_structured_field",
        logicalSourceId: `${APP_ID}:sf:budget`,
        sourceId: `${APP_ID}:sf:budget:v:budget-medium`,
        fieldLabel: "Budget",
      }),
    });
  });

  it("preserves multiselect values as a single observation with array json", () => {
    const chunk = makeStructuredChunk({
      logicalSourceId: `${APP_ID}:sf:languages`,
      sourceId: `${APP_ID}:sf:languages:v:en-es`,
      text: "Application field: Languages. Candidate reports English, Spanish.",
      metadata: {
        sourceLabel: "Languages",
        fieldKey: "languages",
        fieldLabel: "Languages",
        normalizedValue: ["English", "Spanish"],
        valueType: "multiselect",
        chunkClass: "structured_field",
        sensitivity: "default",
        program: "filmmaking",
      },
    });

    const observations = buildFactObservationsFromChunks({ chunks: [chunk] });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      observationType: "application_field",
      fieldKey: "languages",
      valueType: "multiselect",
      valueText: "English, Spanish",
      valueJson: ["English", "Spanish"],
      conflictGroup: "application_field:languages",
    });
  });

  it("extracts a direct tag observation from a tag chunk", () => {
    const chunk = makeTagChunk();

    const observations = buildFactObservationsFromChunks({ chunks: [chunk] });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      contactId: CONTACT_ID,
      observationType: "contact_tag",
      fieldKey: "tag",
      valueType: "tag",
      valueText: "Conservation",
      valueJson: { tagId: "tag-1", tagName: "Conservation" },
      confidence: "high",
      sourceChunkIds: [buildStableChunkId("contact_tag", chunk.sourceId)],
      conflictGroup: "contact_tag:tag-1",
      metadata: expect.objectContaining({
        sourceType: "contact_tag",
        tagId: "tag-1",
        tagName: "Conservation",
      }),
    });
  });

  it("ignores non-structured, non-tag chunks", () => {
    const observations = buildFactObservationsFromChunks({
      chunks: [
        makeStructuredChunk({
          sourceType: "application_answer",
          logicalSourceId: `${APP_ID}:ultimate_vision`,
          sourceId: `${APP_ID}:ultimate_vision:v:ocean`,
          metadata: {
            sourceLabel: "ultimate_vision",
            chunkClass: "free_text_answer",
          },
        }),
      ],
    });

    expect(observations).toEqual([]);
  });

  it("is idempotent for the same chunk version and appends for a changed version", () => {
    const original = makeStructuredChunk();
    const changed = makeStructuredChunk({
      sourceId: `${APP_ID}:sf:budget:v:budget-high`,
      text: "Application field: Budget. Candidate reports $5,000+.",
      metadata: {
        sourceLabel: "Budget",
        fieldKey: "budget",
        fieldLabel: "Budget",
        normalizedValue: "$5,000+",
        valueType: "string",
        chunkClass: "structured_field",
        sensitivity: "default",
        program: "filmmaking",
      },
    });

    const [first] = buildFactObservationsFromChunks({ chunks: [original] });
    const [sameAgain] = buildFactObservationsFromChunks({ chunks: [original] });
    const [updated] = buildFactObservationsFromChunks({ chunks: [changed] });

    expect(first?.id).toBe(sameAgain?.id);
    expect(updated?.id).not.toBe(first?.id);
    expect(updated?.conflictGroup).toBe(first?.conflictGroup);
  });
});
