import { describe, expect, it } from "vitest";
import { EvidenceAliasRegistry } from "./evidence-alias";

describe("EvidenceAliasRegistry", () => {
  it("assigns stable short aliases and resolves them back to real evidence ids", () => {
    const registry = new EvidenceAliasRegistry();

    expect(registry.register("application_answer:app-1:ultimate_vision")).toBe(
      "e1",
    );
    expect(registry.register("contact_tag:tag-1")).toBe("e2");
    expect(registry.register("application_answer:app-1:ultimate_vision")).toBe(
      "e1",
    );

    expect(registry.toRealId("e1")).toBe(
      "application_answer:app-1:ultimate_vision",
    );
    expect(registry.toRealId("[e1]")).toBe(
      "application_answer:app-1:ultimate_vision",
    );
    expect(registry.toRealId("e999")).toBeUndefined();
  });
});
