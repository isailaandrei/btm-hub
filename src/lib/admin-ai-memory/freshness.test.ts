import { describe, it, expect } from "vitest";
import {
  computeChunkSourceFingerprint,
  shouldForceDossierRefreshOnRead,
  isDossierSoftStale,
  isDossierStale,
} from "./freshness";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import type {
  CrmAiContactDossier,
  CrmAiEvidenceChunkInput,
} from "@/types/admin-ai-memory";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeChunkInput(
  overrides: Partial<CrmAiEvidenceChunkInput> = {},
): CrmAiEvidenceChunkInput {
  return {
    contactId: CONTACT_ID,
    applicationId: APP_ID,
    sourceType: "application_answer",
    logicalSourceId: `${APP_ID}:ultimate_vision`,
    sourceId: `${APP_ID}:ultimate_vision`,
    sourceTimestamp: "2026-04-15T00:00:00Z",
    text: "ocean voice",
    metadata: { sourceLabel: "ultimate_vision" },
    contentHash: "hash-1",
    chunkVersion: 1,
    ...overrides,
  };
}

function makeDossier(
  overrides: Partial<CrmAiContactDossier> = {},
): CrmAiContactDossier {
  return {
    contact_id: CONTACT_ID,
    dossier_version: DOSSIER_SCHEMA_VERSION,
    generator_version: DOSSIER_GENERATOR_VERSION,
    source_fingerprint: "fp-existing",
    source_coverage: {
      applicationCount: 1,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
      whatsappMessageCount: 0,
      instagramMessageCount: 0,
      zoomChunkCount: 0,
    },
    facts_json: {},
    signals_json: {
      motivation: [],
      communicationStyle: [],
      reliabilitySignals: [],
      fitSignals: [],
      concerns: [],
    },
    contradictions_json: [],
    unknowns_json: [],
    evidence_anchors_json: [],
    short_summary: "s",
    medium_summary: "m",
    confidence_json: {},
    last_built_at: "2026-04-15T00:00:00Z",
    stale_at: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

describe("computeChunkSourceFingerprint", () => {
  it("is deterministic for the same chunk inputs", () => {
    const a = computeChunkSourceFingerprint([
      makeChunkInput(),
      makeChunkInput({ sourceId: "x", contentHash: "h2" }),
    ]);
    const b = computeChunkSourceFingerprint([
      makeChunkInput({ sourceId: "x", contentHash: "h2" }),
      makeChunkInput(),
    ]);
    expect(a).toBe(b);
  });

  it("changes when chunk content changes", () => {
    const a = computeChunkSourceFingerprint([makeChunkInput()]);
    const b = computeChunkSourceFingerprint([
      makeChunkInput({ contentHash: "different" }),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("isDossierStale", () => {
  it("treats missing dossier as stale", () => {
    const result = isDossierStale({
      dossier: null,
      chunks: [makeChunkInput()],
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      dossierVersion: DOSSIER_SCHEMA_VERSION,
    });
    expect(result).toBe(true);
  });

  it("treats source fingerprint mismatch as stale", () => {
    const result = isDossierStale({
      dossier: makeDossier({ source_fingerprint: "fp-old" }),
      chunks: [makeChunkInput()],
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      dossierVersion: DOSSIER_SCHEMA_VERSION,
    });
    expect(result).toBe(true);
  });

  it("returns false when fingerprint and generator version match", () => {
    const fingerprint = computeChunkSourceFingerprint([makeChunkInput()]);
    const result = isDossierStale({
      dossier: makeDossier({ source_fingerprint: fingerprint }),
      chunks: [makeChunkInput()],
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      dossierVersion: DOSSIER_SCHEMA_VERSION,
    });
    expect(result).toBe(false);
  });
});

describe("shouldForceDossierRefreshOnRead", () => {
  it("returns true when dossier is missing", () => {
    expect(
      shouldForceDossierRefreshOnRead({
        dossier: null,
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      }),
    ).toBe(true);
  });

  it("returns false for a matching dossier even when stale_at is set", () => {
    expect(
      shouldForceDossierRefreshOnRead({
        dossier: makeDossier({
          generator_version: DOSSIER_GENERATOR_VERSION,
          stale_at: "2026-04-15T00:00:00Z",
        }),
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      }),
    ).toBe(false);
  });

  it("does not force a read-time rebuild for dossier-prompt-v1 rows", () => {
    expect(
      shouldForceDossierRefreshOnRead({
        dossier: makeDossier({
          generator_version: "dossier-prompt-v1",
          dossier_version: DOSSIER_SCHEMA_VERSION,
        }),
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      }),
    ).toBe(false);
  });
});

describe("isDossierSoftStale", () => {
  it("returns true when stale_at has passed", () => {
    expect(
      isDossierSoftStale({
        dossier: makeDossier({ stale_at: "2026-04-15T00:00:00Z" }),
        now: new Date("2026-04-15T01:00:00Z"),
      }),
    ).toBe(true);
  });

  it("returns false when stale_at is null", () => {
    expect(
      isDossierSoftStale({
        dossier: makeDossier({ stale_at: null }),
        now: new Date("2026-04-15T01:00:00Z"),
      }),
    ).toBe(false);
  });
});
