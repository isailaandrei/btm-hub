import { describe, it, expect } from "vitest";
import {
  RUBRIC_CATEGORIES,
  scoreDossier,
  classifyTotalScore,
} from "./eval-rubric";

function fullScore(): Record<string, 0 | 1 | 2> {
  return {
    factualAccuracy: 2,
    fitSignalRecall: 2,
    concernRecall: 2,
    contradictionHandling: 2,
    uncertaintyHonesty: 2,
    evidenceGrounding: 2,
    usefulnessForRanking: 2,
  };
}

describe("scoreDossier", () => {
  it("rejects scores outside 0|1|2", () => {
    expect(() =>
      scoreDossier({
        scores: { ...fullScore(), factualAccuracy: 3 as unknown as 0 | 1 | 2 },
        hardFails: [],
      }),
    ).toThrow(/0\|1\|2/i);
  });

  it("rejects when categories are missing", () => {
    const partial = { ...fullScore() } as Record<string, 0 | 1 | 2>;
    delete partial.factualAccuracy;
    expect(() => scoreDossier({ scores: partial, hardFails: [] })).toThrow(
      /missing/i,
    );
  });

  it("sums all categories", () => {
    const result = scoreDossier({ scores: fullScore(), hardFails: [] });
    expect(result.total).toBe(RUBRIC_CATEGORIES.length * 2);
  });

  it("hard-fail rules force a hard_fail verdict regardless of total", () => {
    const result = scoreDossier({
      scores: fullScore(),
      hardFails: ["factual_hallucination_on_core_facts"],
    });
    expect(result.verdict).toBe("hard_fail");
    expect(result.total).toBe(RUBRIC_CATEGORIES.length * 2);
  });

  it("rejects unknown hard-fail keys", () => {
    expect(() =>
      scoreDossier({
        scores: fullScore(),
        hardFails: ["bogus_rule"],
      }),
    ).toThrow(/unknown hard-fail/i);
  });
});

describe("classifyTotalScore", () => {
  it("returns strong for >= 12", () => {
    expect(classifyTotalScore(14)).toBe("strong");
    expect(classifyTotalScore(12)).toBe("strong");
  });
  it("returns acceptable for 9..11", () => {
    expect(classifyTotalScore(11)).toBe("acceptable");
    expect(classifyTotalScore(9)).toBe("acceptable");
  });
  it("returns insufficient for < 9", () => {
    expect(classifyTotalScore(8)).toBe("insufficient");
    expect(classifyTotalScore(0)).toBe("insufficient");
  });
});
