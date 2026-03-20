import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSanityFetch = vi.fn();

vi.mock("@/lib/sanity/live", () => ({
  sanityFetch: (...args: unknown[]) => mockSanityFetch(...args),
  SanityLive: () => null,
}));

vi.mock("@/lib/sanity/client", () => ({
  client: { fetch: vi.fn() },
}));

import { getProgramShowcase } from "./programs";

describe("getProgramShowcase", () => {
  beforeEach(() => {
    mockSanityFetch.mockReset();
  });

  it("returns null for unknown slugs", async () => {
    const result = await getProgramShowcase("nonexistent");
    expect(result).toBeNull();
    expect(mockSanityFetch).not.toHaveBeenCalled();
  });

  it("returns config and null cms when CMS has no content", async () => {
    mockSanityFetch.mockResolvedValueOnce({ data: null });

    const result = await getProgramShowcase("photography");
    expect(result).not.toBeNull();
    expect(result!.config.slug).toBe("photography");
    expect(result!.config.name).toBe("Underwater Photography");
    expect(result!.cms).toBeNull();
  });

  it("returns config and cms when CMS content exists", async () => {
    const mockCms = {
      _id: "abc",
      slug: "photography",
      heroImage: null,
      fullDescription: [{ _type: "block", children: [] }],
      highlights: ["Hands-on training"],
      seoDescription: "SEO test",
    };
    mockSanityFetch.mockResolvedValueOnce({ data: mockCms });

    const result = await getProgramShowcase("photography");
    expect(result).not.toBeNull();
    expect(result!.cms).toEqual(mockCms);
    expect(result!.cms!.seoDescription).toBe("SEO test");
  });

  it("works for all four program slugs", async () => {
    const slugs = ["photography", "filmmaking", "freediving", "internship"];
    for (const slug of slugs) {
      mockSanityFetch.mockResolvedValueOnce({ data: null });
      const result = await getProgramShowcase(slug);
      expect(result).not.toBeNull();
      expect(result!.config.slug).toBe(slug);
    }
  });
});
