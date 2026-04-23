import { describe, expect, it } from "vitest";
import { buildStableChunkId } from "./chunk-identity";
import {
  buildEmbeddingContentForSubchunk,
  buildEvidenceSubchunks,
} from "./subchunk-builder";
import type { CrmAiEvidenceChunkInput } from "@/types/admin-ai-memory";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeChunk(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: APP_ID,
    sourceType: "application_answer",
    logicalSourceId: `${APP_ID}:ultimate_vision`,
    sourceId: `${APP_ID}:ultimate_vision:v:hash`,
    sourceTimestamp: "2026-04-20T10:00:00Z",
    text: "I want to work on ambitious conservation storytelling projects.",
    metadata: {
      sourceLabel: "ultimate_vision",
      fieldKey: "ultimate_vision",
      fieldLabel: "Ultimate Vision",
      program: "filmmaking",
      chunkClass: "free_text_answer",
    },
    contentHash: "hash-1",
    chunkVersion: 1,
    ...overrides,
  };
}

describe("buildEvidenceSubchunks", () => {
  it("keeps short structured chunks as a single retrievable subchunk", () => {
    const parentChunk = makeChunk({
      sourceType: "application_structured_field",
      logicalSourceId: `${APP_ID}:sf:budget`,
      sourceId: `${APP_ID}:sf:budget:v:hash`,
      text: "Application field: Budget. Candidate reports $2,000 - $5,000.",
      metadata: {
        sourceLabel: "Budget",
        fieldKey: "budget",
        fieldLabel: "Budget",
        normalizedValue: "$2,000 - $5,000",
        valueType: "string",
        program: "filmmaking",
        chunkClass: "structured_field",
        sensitivity: "default",
      },
    });

    const subchunks = buildEvidenceSubchunks({
      chunks: [parentChunk],
    });

    expect(subchunks).toHaveLength(1);
    expect(subchunks[0]).toMatchObject({
      parentChunkId: buildStableChunkId(
        parentChunk.sourceType,
        parentChunk.sourceId,
      ),
      contactId: CONTACT_ID,
      applicationId: APP_ID,
      subchunkIndex: 0,
      text: parentChunk.text,
      metadata: expect.objectContaining({
        sourceType: "application_structured_field",
        chunkClass: "structured_field",
      }),
    });
    expect(subchunks[0]?.tokenEstimate).toBeGreaterThan(0);
  });

  it("splits oversized free-text chunks deterministically with overlap", () => {
    const text = Array.from({ length: 40 }, (_, index) => `token${index + 1}`)
      .join(" ");
    const parentChunk = makeChunk({ text });

    const firstPass = buildEvidenceSubchunks({
      chunks: [parentChunk],
      maxTokens: 12,
      overlapTokens: 3,
    });
    const secondPass = buildEvidenceSubchunks({
      chunks: [parentChunk],
      maxTokens: 12,
      overlapTokens: 3,
    });

    expect(firstPass.length).toBeGreaterThan(1);
    expect(firstPass.map((item) => item.id)).toEqual(
      secondPass.map((item) => item.id),
    );
    expect(firstPass.map((item) => item.text)).toEqual(
      secondPass.map((item) => item.text),
    );
    expect(firstPass[0]?.text.split(/\s+/)).toHaveLength(12);
    expect(firstPass[1]?.text.split(/\s+/).slice(0, 3)).toEqual([
      "token10",
      "token11",
      "token12",
    ]);
  });
});

describe("buildEmbeddingContentForSubchunk", () => {
  it("renders contextualized embedding text from the parent chunk metadata", () => {
    const parentChunk = makeChunk({
      sourceType: "application_structured_field",
      logicalSourceId: `${APP_ID}:sf:gender`,
      sourceId: `${APP_ID}:sf:gender:v:hash`,
      text: "Application field: Gender. Candidate reports Female.",
      metadata: {
        sourceLabel: "Gender",
        fieldKey: "gender",
        fieldLabel: "Gender",
        normalizedValue: "female",
        valueType: "string",
        program: "filmmaking",
        chunkClass: "structured_field",
        sensitivity: "sensitive",
      },
    });

    const [subchunk] = buildEvidenceSubchunks({
      chunks: [parentChunk],
    });

    const content = buildEmbeddingContentForSubchunk({
      parentChunk,
      subchunk,
    });

    expect(content).toContain("Source type: application_structured_field");
    expect(content).toContain("Source label: Gender");
    expect(content).toContain("Program: filmmaking");
    expect(content).toContain("Field key: gender");
    expect(content).toContain("Sensitivity: sensitive");
    expect(content).toContain(parentChunk.text);
  });
});
