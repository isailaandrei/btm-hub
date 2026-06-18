import { describe, expect, it } from "vitest";
import { computeMailyContentHash } from "./content-hash";

describe("computeMailyContentHash", () => {
  it("is stable across object key order", () => {
    const a = { type: "doc", content: [{ type: "text", text: "hi" }] };
    const b = { content: [{ text: "hi", type: "text" }], type: "doc" };
    expect(computeMailyContentHash(a)).toBe(computeMailyContentHash(b));
  });

  it("differs when the body differs", () => {
    const a = { type: "doc", content: [{ type: "text", text: "hi" }] };
    const b = { type: "doc", content: [{ type: "text", text: "bye" }] };
    expect(computeMailyContentHash(a)).not.toBe(computeMailyContentHash(b));
  });

  it("differs when layout attributes differ", () => {
    const a = { type: "doc", attrs: { maxWidth: 680 }, content: [] };
    const b = { type: "doc", attrs: { maxWidth: 600 }, content: [] };
    expect(computeMailyContentHash(a)).not.toBe(computeMailyContentHash(b));
  });

  it("treats array order as significant", () => {
    const a = { content: [{ text: "1" }, { text: "2" }] };
    const b = { content: [{ text: "2" }, { text: "1" }] };
    expect(computeMailyContentHash(a)).not.toBe(computeMailyContentHash(b));
  });

  it("ignores undefined values", () => {
    const a = { type: "doc", extra: undefined, content: [] };
    const b = { type: "doc", content: [] };
    expect(computeMailyContentHash(a)).toBe(computeMailyContentHash(b));
  });

  it("returns a 64-char hex sha256", () => {
    expect(computeMailyContentHash({ type: "doc" })).toMatch(/^[0-9a-f]{64}$/);
  });
});
