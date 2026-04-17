/**
 * Dossier evaluation rubric.
 *
 * Encodes the design's seven scoring categories plus the hard-fail rules
 * that override numeric scoring. The harness in
 * `scripts/admin-ai-memory/eval.ts` calls this module to compute a
 * verdict from a reviewer's structured scoring file.
 */

export type RubricScore = 0 | 1 | 2;

export const RUBRIC_CATEGORIES = [
  "factualAccuracy",
  "fitSignalRecall",
  "concernRecall",
  "contradictionHandling",
  "uncertaintyHonesty",
  "evidenceGrounding",
  "usefulnessForRanking",
] as const;

export type RubricCategory = (typeof RUBRIC_CATEGORIES)[number];

export type RubricScores = Record<RubricCategory, RubricScore>;

export const HARD_FAIL_RULES = [
  "factual_hallucination_on_core_facts",
  "missing_obvious_major_concern",
  "unsupported_strong_inference",
] as const;

export type HardFailRule = (typeof HARD_FAIL_RULES)[number];

const HARD_FAIL_SET: ReadonlySet<string> = new Set(HARD_FAIL_RULES);

export type Verdict = "strong" | "acceptable" | "insufficient" | "hard_fail";

export type DossierScoreInput = {
  scores: Partial<RubricScores>;
  hardFails: string[];
};

export type DossierScoreResult = {
  scores: RubricScores;
  total: number;
  verdict: Verdict;
  hardFails: HardFailRule[];
};

function isValidScore(value: unknown): value is RubricScore {
  return value === 0 || value === 1 || value === 2;
}

export function classifyTotalScore(total: number): Verdict {
  if (total >= 12) return "strong";
  if (total >= 9) return "acceptable";
  return "insufficient";
}

export function scoreDossier(input: DossierScoreInput): DossierScoreResult {
  for (const category of RUBRIC_CATEGORIES) {
    if (!(category in input.scores)) {
      throw new Error(`Rubric scores missing category: ${category}`);
    }
    const value = input.scores[category];
    if (!isValidScore(value)) {
      throw new Error(
        `Rubric score for ${category} must be 0|1|2 (got ${String(value)})`,
      );
    }
  }
  const validHardFails: HardFailRule[] = [];
  for (const rule of input.hardFails) {
    if (!HARD_FAIL_SET.has(rule)) {
      throw new Error(`Unknown hard-fail rule: ${rule}`);
    }
    validHardFails.push(rule as HardFailRule);
  }

  const scores = input.scores as RubricScores;
  const total = RUBRIC_CATEGORIES.reduce((acc, key) => acc + scores[key], 0);
  const verdict: Verdict =
    validHardFails.length > 0 ? "hard_fail" : classifyTotalScore(total);

  return {
    scores,
    total,
    verdict,
    hardFails: validHardFails,
  };
}
