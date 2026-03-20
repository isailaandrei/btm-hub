import { describe, it, expect } from "vitest";
import { urlFor } from "./image";

describe("urlFor", () => {
  const mockSource = {
    _type: "image" as const,
    asset: {
      _ref: "image-abc123-800x600-png",
      _type: "reference" as const,
    },
  };

  it("returns an image URL builder with .url()", () => {
    const url = urlFor(mockSource).url();
    expect(url).toContain("cdn.sanity.io");
    expect(url).toContain("test-project");
  });

  it("supports width/height chaining", () => {
    const url = urlFor(mockSource).width(400).height(300).url();
    expect(url).toContain("w=400");
    expect(url).toContain("h=300");
  });
});
