import { describe, expect, it } from "vitest";
import { formatEuroCents, parseEuroCentsInput } from "./money";

describe("shop money helpers", () => {
  it("formats EUR cents using Portugal-friendly currency display", () => {
    expect(formatEuroCents(1299)).toBe("EUR 12.99");
  });

  it("parses decimal admin input into cents", () => {
    expect(parseEuroCentsInput("12.99")).toBe(1299);
    expect(parseEuroCentsInput("12,99")).toBe(1299);
  });

  it("rejects negative and invalid prices", () => {
    expect(() => parseEuroCentsInput("-1")).toThrow("Enter a valid EUR price");
    expect(() => parseEuroCentsInput("abc")).toThrow("Enter a valid EUR price");
  });
});
