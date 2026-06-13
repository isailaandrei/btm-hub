import { describe, expect, it } from "vitest";
import {
  budgetValueMeetsMinimum,
  extractHardConstraints,
} from "./hard-constraints";

describe("admin AI hard constraints", () => {
  it("extracts minimum budget requirements from natural-language questions", () => {
    expect(
      extractHardConstraints("female candidates with budget 6k or more"),
    ).toEqual({ budgetMin: 6000 });
    expect(
      extractHardConstraints("show candidates with at least 12.5k budget"),
    ).toEqual({ budgetMin: 12500 });
  });

  it("only accepts budget bands whose lower bound meets the requested minimum", () => {
    expect(
      budgetValueMeetsMinimum("Advanced budget (3,000 - 6,000 €/USD)", 6000),
    ).toBe(false);
    expect(
      budgetValueMeetsMinimum("Professional budget (6,000 - 12,000 €/USD)", 6000),
    ).toBe(true);
    expect(
      budgetValueMeetsMinimum("All-In budget (>12,000 €/USD)", 6000),
    ).toBe(true);
    expect(budgetValueMeetsMinimum("~$8k", 6000)).toBe(true);
    expect(budgetValueMeetsMinimum("Small budget (under 1,000 €/USD)", 6000)).toBe(
      false,
    );
  });
});
