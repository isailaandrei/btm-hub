import { describe, it, expect } from "vitest";
import { buildRankingCardFromDossier } from "./ranking-card";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

function makeDossier(
  overrides: Partial<CrmAiContactDossier> = {},
): CrmAiContactDossier {
  return {
    contact_id: CONTACT_ID,
    dossier_version: 2,
    generator_version: "dossier-prompt-v1",
    source_fingerprint: "fp-1",
    source_coverage: {
      applicationCount: 1,
      contactNoteCount: 1,
      applicationAdminNoteCount: 0,
      whatsappMessageCount: 0,
      instagramMessageCount: 0,
      zoomChunkCount: 0,
    },
    facts_json: {
      contact: {
        contactName: "Joana",
      },
      applications: {
        applicationCount: 1,
        programHistory: ["filmmaking"],
        statusHistory: ["reviewing"],
      },
      tags: {
        tagNames: ["Strong fit"],
      },
      structuredFacts: {
        countryOfResidenceValues: ["Portugal"],
        certificationLevelValues: ["Open Water"],
      },
    },
    signals_json: {
      motivation: [
        { value: "Ocean conservation focus", confidence: "high" },
      ],
      communicationStyle: [
        { value: "Concise, direct", confidence: "medium" },
      ],
      reliabilitySignals: [],
      fitSignals: [
        { value: "Strong filmmaking experience", confidence: "high" },
        { value: "Open Water certified", confidence: "medium" },
        { value: "Filler signal", confidence: "low" },
        { value: "Less important", confidence: "low" },
      ],
      concerns: [
        { value: "Limited diving hours", confidence: "medium" },
        { value: "Travel uncertain", confidence: "low" },
        { value: "Tertiary concern", confidence: "low" },
      ],
    },
    contradictions_json: [],
    unknowns_json: ["No info on team availability for Q3"],
    evidence_anchors_json: [],
    short_summary: "Passionate ocean storyteller, mid-experience diver.",
    medium_summary: "Joana brings strong filmmaking and conservation focus.",
    confidence_json: { overall: "medium" },
    last_built_at: "2026-04-15T00:00:00Z",
    stale_at: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

describe("buildRankingCardFromDossier", () => {
  it("derives a deterministic ranking card from a dossier", () => {
    const card = buildRankingCardFromDossier(makeDossier());
    expect(card.contactId).toBe(CONTACT_ID);
    expect(card.dossierVersion).toBe(2);
    expect(card.sourceFingerprint).toBe("fp-1");
    expect(card.shortSummary).toContain("Passionate");
  });

  it("keeps key facts intact", () => {
    const card = buildRankingCardFromDossier(makeDossier());
    expect(card.facts).toMatchObject({
      contactName: "Joana",
      certificationLevelValues: ["Open Water"],
    });
  });

  it("drops unknown fact shapes instead of leaking raw fields", () => {
    const card = buildRankingCardFromDossier(
      makeDossier({
        facts_json: {
          privateNote: "should not leak",
        },
      }),
    );
    expect(card.facts).toEqual({});
  });

  it("caps top fit signals and top concerns to a small number", () => {
    const card = buildRankingCardFromDossier(makeDossier());
    expect(card.topFitSignals.length).toBeLessThanOrEqual(3);
    expect(card.topConcerns.length).toBeLessThanOrEqual(3);
  });

  it("prefers higher-confidence signals first", () => {
    const card = buildRankingCardFromDossier(makeDossier());
    const confidences = card.topFitSignals.map((s) => s.confidence);
    expect(confidences[0]).toBe("high");
  });

  it("preserves confidence notes from unknowns", () => {
    const card = buildRankingCardFromDossier(makeDossier());
    expect(card.confidenceNotes).toContain("No info on team availability for Q3");
  });

  it("is deterministic — same input produces identical output", () => {
    const dossier = makeDossier();
    const a = buildRankingCardFromDossier(dossier);
    const b = buildRankingCardFromDossier(dossier);
    expect(a).toEqual(b);
  });
});
