import { describe, expect, it } from "vitest";
import type { CommandProps } from "@maily-to/core/blocks";
import { socialBlockGroup } from "./social-blocks";

/** A minimal chainable editor that records what the command inserts. */
function captureInsert() {
  let inserted: unknown;
  const chain: Record<string, unknown> = {
    focus: () => chain,
    deleteRange: () => chain,
    insertContent: (content: unknown) => {
      inserted = content;
      return chain;
    },
    run: () => true,
  };
  const editor = { chain: () => chain } as unknown as CommandProps["editor"];
  return { editor, getInserted: () => inserted as Record<string, unknown> };
}

describe("socialBlockGroup", () => {
  it("exposes only the social row — individual icons removed", () => {
    expect(socialBlockGroup.commands).toHaveLength(1);
    expect(socialBlockGroup.commands[0].title).toBe("Social icons row");
  });

  it("builds a right-aligned row: filler, then Instagram, YouTube, Facebook", () => {
    type Column = {
      attrs: { width: number };
      content: Array<{ type: string; attrs: { alt?: string; externalLink?: string } }>;
    };
    const { editor, getInserted } = captureInsert();
    const { command } = socialBlockGroup.commands[0];
    if (!command) throw new Error("expected the social row command");
    command({ editor, range: { from: 0, to: 0 } });
    const row = getInserted();
    const columns = row.content as Column[];

    expect(row.type).toBe("columns");
    // The first column is a wide empty filler that pushes the icons to the right.
    expect(columns[0].content[0].type).toBe("spacer");
    expect(columns[0].attrs.width).toBeGreaterThan(50);
    // The remaining columns are the three icons, left-to-right in this order.
    const icons = columns.slice(1).map((column) => column.content[0].attrs.alt);
    expect(icons).toEqual(["Instagram", "YouTube", "Facebook"]);
    // Each icon links to its platform.
    const links = columns.slice(1).map((column) => column.content[0].attrs.externalLink);
    expect(links).toEqual([
      "https://instagram.com/",
      "https://youtube.com/",
      "https://facebook.com/",
    ]);
  });
});
