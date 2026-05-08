import { describe, expect, it } from "vitest";
import { parseShopContentBlocks } from "./content-blocks";

describe("shop content blocks", () => {
  it("accepts the launch block types", () => {
    const result = parseShopContentBlocks([
      { type: "rich_text", body: "Built for cold-water training." },
      { type: "specs", rows: [{ label: "Material", value: "Yamamoto neoprene" }] },
      { type: "bullets", title: "Best for", items: ["Freediving", "Pool training"] },
      { type: "media", mediaId: "media-1", caption: "Front view" },
    ]);

    expect(result).toHaveLength(4);
  });

  it("rejects unknown block types", () => {
    expect(() => parseShopContentBlocks([{ type: "unknown" }])).toThrow("Invalid product content");
  });
});
