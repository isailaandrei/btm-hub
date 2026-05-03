import { describe, expect, it } from "vitest";
import { prependTemplateOnce } from "./template-list-state";

describe("prependTemplateOnce", () => {
  it("prepends a new template", () => {
    const existing = [{ id: "template-1", name: "Existing" }];
    const created = { id: "template-2", name: "Created" };

    expect(prependTemplateOnce(existing, created)).toEqual([
      created,
      existing[0],
    ]);
  });

  it("replaces an existing template with the same id instead of duplicating it", () => {
    const existing = [
      { id: "template-1", name: "Existing" },
      { id: "template-2", name: "Older name" },
    ];
    const created = { id: "template-2", name: "Created" };

    expect(prependTemplateOnce(existing, created)).toEqual([
      existing[0],
      created,
    ]);
  });
});
