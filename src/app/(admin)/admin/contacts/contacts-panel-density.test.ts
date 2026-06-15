import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "contacts-panel.tsx"), "utf8");

describe("ContactsPanel density", () => {
  it("keeps the table inside its own constrained horizontal scroll area", () => {
    expect(source).toContain('data-testid="contacts-table-scroll"');
    expect(source).toContain("max-w-full min-w-0 overflow-x-auto");
    expect(source).toContain("style={{ minWidth: tableMinWidth }}");
  });

  it("uses compact table typography and cell spacing for the admin contacts grid", () => {
    expect(source).toContain("text-[13px]");
    expect(source).toContain("[&_td]:px-2.5");
    expect(source).toContain("[&_td]:py-2");
    expect(source).toContain("[&_th]:h-9");
    expect(source).toContain("max-w-full");
    expect(source).toContain("min-w-0 truncate");
  });

  it("reserves bottom space when the floating bulk action bar is visible", () => {
    expect(source).toContain(
      'state.selectedIds.size > 0 ? "pb-28" : ""',
    );
  });

  it("offers an all rows page size option", () => {
    expect(source).toContain('key="all"');
    expect(source).toContain(">All</button>");
  });
});
