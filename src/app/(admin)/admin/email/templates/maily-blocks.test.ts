import { describe, expect, it } from "vitest";
import { mailyBlockGroups } from "./maily-blocks";

describe("mailyBlockGroups", () => {
  it("exposes the section block for colored email areas", () => {
    const layoutGroup = mailyBlockGroups.find((group) => group.title === "Layout");

    expect(layoutGroup?.commands.some((command) => command.title === "Section"))
      .toBe(true);
  });
});
