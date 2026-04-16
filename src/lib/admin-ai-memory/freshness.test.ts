import { describe, it, expect } from "vitest";
import {
  computeChunkSourceFingerprint,
  findContactsNeedingMemoryRefresh,
  shouldForceDossierRefreshOnRead,
  isDossierSoftStale,
  isDossierStale,
  isRankingCardStale,
  needsContactMemoryRebuild,
} from "./freshness";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
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

function makeRankingCard(
  overrides: Partial<CrmAiContactRankingCard> = {},
): CrmAiContactRankingCard {
  return {
    contact_id: CONTACT_ID,
    dossier_version: DOSSIER_SCHEMA_VERSION,
    source_fingerprint: "fp-existing",
    facts_json: {},
    top_fit_signals_json: [],
    top_concerns_json: [],
    confidence_notes_json: [],
    short_summary: "s",
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

  it("treats generator version drift as stale", () => {
    const dossier = makeDossier({ generator_version: "dossier-prompt-v0" });
    const fingerprint = computeChunkSourceFingerprint([makeChunkInput()]);
    const result = isDossierStale({
      dossier: { ...dossier, source_fingerprint: fingerprint },
      chunks: [makeChunkInput()],
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      dossierVersion: DOSSIER_SCHEMA_VERSION,
    });
    expect(result).toBe(true);
  });

  it("treats dossier version drift as stale", () => {
    const fingerprint = computeChunkSourceFingerprint([makeChunkInput()]);
    const result = isDossierStale({
      dossier: makeDossier({
        dossier_version: DOSSIER_SCHEMA_VERSION - 1,
        source_fingerprint: fingerprint,
      }),
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

describe("isRankingCardStale", () => {
  it("treats missing ranking card as stale", () => {
    const result = isRankingCardStale({
      rankingCard: null,
      dossier: makeDossier(),
    });
    expect(result).toBe(true);
  });

  it("is stale when ranking card lags dossier version", () => {
    const result = isRankingCardStale({
      rankingCard: makeRankingCard({ dossier_version: 1 }),
      dossier: makeDossier({ dossier_version: 2 }),
    });
    expect(result).toBe(true);
  });

  it("is stale when ranking card has a different fingerprint", () => {
    const result = isRankingCardStale({
      rankingCard: makeRankingCard({ source_fingerprint: "fp-other" }),
      dossier: makeDossier({ source_fingerprint: "fp-current" }),
    });
    expect(result).toBe(true);
  });

  it("returns false when ranking card matches dossier", () => {
    const result = isRankingCardStale({
      rankingCard: makeRankingCard(),
      dossier: makeDossier(),
    });
    expect(result).toBe(false);
  });
});

describe("needsContactMemoryRebuild", () => {
  it("returns true when either dossier or ranking card is stale", () => {
    const fingerprint = computeChunkSourceFingerprint([makeChunkInput()]);
    expect(
      needsContactMemoryRebuild({
        dossier: null,
        rankingCard: null,
        chunks: [makeChunkInput()],
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      }),
    ).toBe(true);
    expect(
      needsContactMemoryRebuild({
        dossier: makeDossier({ source_fingerprint: fingerprint }),
        rankingCard: null,
        chunks: [makeChunkInput()],
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      }),
    ).toBe(true);
  });

  it("returns false when both dossier and ranking card are fresh", () => {
    const fingerprint = computeChunkSourceFingerprint([makeChunkInput()]);
    const dossier = makeDossier({ source_fingerprint: fingerprint });
    const rankingCard = makeRankingCard({ source_fingerprint: fingerprint });
    expect(
      needsContactMemoryRebuild({
        dossier,
        rankingCard,
        chunks: [makeChunkInput()],
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      }),
    ).toBe(false);
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

  it("returns true when dossier version drifts", () => {
    expect(
      shouldForceDossierRefreshOnRead({
        dossier: makeDossier({
          dossier_version: DOSSIER_SCHEMA_VERSION - 1,
        }),
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

describe("findContactsNeedingMemoryRefresh", () => {
  it("marks contacts stale when dossier is missing, stale, or card lags the dossier", () => {
    const staleAt = "2026-04-15T00:00:00Z";
    const result = findContactsNeedingMemoryRefresh({
      contactIds: ["a", "b", "c", "d"],
      dossiers: [
        makeDossier({ contact_id: "a", stale_at: staleAt }),
        makeDossier({ contact_id: "c" }),
        makeDossier({ contact_id: "d" }),
      ],
      rankingCards: [
        makeRankingCard({ contact_id: "a" }),
        makeRankingCard({ contact_id: "c", dossier_version: 0 }),
        makeRankingCard({ contact_id: "d" }),
      ],
      generatorVersion: DOSSIER_GENERATOR_VERSION,
      dossierVersion: DOSSIER_SCHEMA_VERSION,
      now: new Date("2026-04-15T01:00:00Z"),
    });

    expect(result).toEqual(["a", "b", "c"]);
  });
});
