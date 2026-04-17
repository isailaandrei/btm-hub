import { describe, it, expect } from "vitest";
import {
  MAX_DOSSIER_CHARS,
  MAX_DOSSIER_CHUNKS,
  selectChunksForDossier,
} from "./dossier-chunk-selection";
import type { CrmAiEvidenceChunkInput } from "@/types/admin-ai-memory";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function chunk(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: APP_ID,
    sourceType: "application_answer",
    sourceId: `${APP_ID}:ultimate_vision`,
    sourceTimestamp: "2026-04-15T00:00:00Z",
    text: "ocean voice",
    metadata: { sourceLabel: "ultimate_vision" },
    contentHash: "h",
    chunkVersion: 1,
    ...overrides,
  };
}

describe("selectChunksForDossier", () => {
  it("caps at MAX_DOSSIER_CHUNKS when chunk count exceeds the limit", () => {
    const many = Array.from({ length: MAX_DOSSIER_CHUNKS + 20 }, (_, i) =>
      chunk({
        sourceType: "contact_note",
        sourceId: `note-${i}`,
        text: `note ${i}`,
      }),
    );
    const result = selectChunksForDossier(many);
    expect(result.selected).toHaveLength(MAX_DOSSIER_CHUNKS);
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.droppedByChunkCap).toBe(20);
  });

  it("caps at MAX_DOSSIER_CHARS when total text exceeds the limit", () => {
    const big = Array.from({ length: 10 }, (_, i) =>
      chunk({
        sourceType: "application_answer",
        sourceId: `${APP_ID}:field-${i}`,
        metadata: { sourceLabel: `field-${i}` },
        text: "x".repeat(5_000),
      }),
    );
    const result = selectChunksForDossier(big);
    expect(result.stats.selectedChars).toBeLessThanOrEqual(MAX_DOSSIER_CHARS);
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.droppedByCharCap).toBeGreaterThan(0);
  });

  it("puts contact notes before admin notes before application answers", () => {
    const input: CrmAiEvidenceChunkInput[] = [
      chunk({
        sourceType: "application_answer",
        sourceId: `${APP_ID}:ultimate_vision`,
        metadata: { sourceLabel: "ultimate_vision" },
      }),
      chunk({
        sourceType: "application_admin_note",
        sourceId: `${APP_ID}:an:abc`,
        sourceTimestamp: "2026-04-15T00:00:00Z",
      }),
      chunk({
        sourceType: "contact_note",
        sourceId: "note-1",
        sourceTimestamp: "2026-04-15T00:00:00Z",
      }),
    ];
    const { selected } = selectChunksForDossier(input);
    expect(selected.map((c) => c.sourceType)).toEqual([
      "contact_note",
      "application_admin_note",
      "application_answer",
    ]);
  });

  it("sorts notes by timestamp (most recent first)", () => {
    const input: CrmAiEvidenceChunkInput[] = [
      chunk({
        sourceType: "contact_note",
        sourceId: "note-old",
        sourceTimestamp: "2026-01-01T00:00:00Z",
      }),
      chunk({
        sourceType: "contact_note",
        sourceId: "note-new",
        sourceTimestamp: "2026-04-15T00:00:00Z",
      }),
      chunk({
        sourceType: "contact_note",
        sourceId: "note-mid",
        sourceTimestamp: "2026-02-15T00:00:00Z",
      }),
    ];
    const { selected } = selectChunksForDossier(input);
    expect(selected.map((c) => c.sourceId)).toEqual([
      "note-new",
      "note-mid",
      "note-old",
    ]);
  });

  it("sorts application answers by ADMIN_AI_TEXT_FIELDS order", () => {
    const input: CrmAiEvidenceChunkInput[] = [
      chunk({
        sourceType: "application_answer",
        sourceId: `${APP_ID}:candidacy_reason`,
        metadata: { sourceLabel: "candidacy_reason" },
      }),
      chunk({
        sourceType: "application_answer",
        sourceId: `${APP_ID}:ultimate_vision`,
        metadata: { sourceLabel: "ultimate_vision" },
      }),
      chunk({
        sourceType: "application_answer",
        sourceId: `${APP_ID}:inspiration_to_apply`,
        metadata: { sourceLabel: "inspiration_to_apply" },
      }),
    ];
    const { selected } = selectChunksForDossier(input);
    // ADMIN_AI_TEXT_FIELDS order: ultimate_vision, inspiration_to_apply, ..., candidacy_reason
    expect(selected.map((c) => c.metadata.sourceLabel)).toEqual([
      "ultimate_vision",
      "inspiration_to_apply",
      "candidacy_reason",
    ]);
  });

  it("dedups chunks with the same (sourceType, sourceId)", () => {
    const duplicate = chunk({
      sourceType: "contact_note",
      sourceId: "note-1",
    });
    const { selected } = selectChunksForDossier([duplicate, duplicate]);
    expect(selected).toHaveLength(1);
  });

  it("is deterministic: same input produces same output", () => {
    const input: CrmAiEvidenceChunkInput[] = [
      chunk({ sourceType: "contact_note", sourceId: "a" }),
      chunk({ sourceType: "contact_note", sourceId: "b" }),
      chunk({ sourceType: "application_answer", sourceId: "c" }),
    ];
    const a = selectChunksForDossier(input);
    const b = selectChunksForDossier(input);
    expect(a.selected.map((c) => c.sourceId)).toEqual(
      b.selected.map((c) => c.sourceId),
    );
  });

  it("reports truncated=false when nothing was dropped", () => {
    const small = [chunk()];
    const { stats } = selectChunksForDossier(small);
    expect(stats.truncated).toBe(false);
    expect(stats.droppedByChunkCap).toBe(0);
    expect(stats.droppedByCharCap).toBe(0);
  });

  it("char cap keeps earlier priority chunks when a later one would overflow", () => {
    const input: CrmAiEvidenceChunkInput[] = [
      chunk({
        sourceType: "contact_note",
        sourceId: "note-1",
        text: "x".repeat(15_000),
      }),
      chunk({
        sourceType: "application_answer",
        sourceId: `${APP_ID}:ultimate_vision`,
        metadata: { sourceLabel: "ultimate_vision" },
        text: "x".repeat(10_000),
      }),
    ];
    const { selected, stats } = selectChunksForDossier(input);
    expect(selected.map((c) => c.sourceType)).toEqual(["contact_note"]);
    expect(stats.droppedByCharCap).toBe(1);
  });
});
