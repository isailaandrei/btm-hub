import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSanityFetch = vi.fn();
const mockClientFetch = vi.fn();

vi.mock("@/lib/sanity/live", () => ({
  sanityFetch: (...args: unknown[]) => mockSanityFetch(...args),
  SanityLive: () => null,
}));

vi.mock("@/lib/sanity/client", () => ({
  client: {
    fetch: (...args: unknown[]) => mockClientFetch(...args),
  },
}));

import {
  getFilms,
  getFilmBySlug,
  getAllFilmSlugs,
  getTeamMembers,
  getPartners,
  getFeaturedPartners,
  getProgramContent,
} from "./sanity";

describe("sanity data fetchers", () => {
  beforeEach(() => {
    mockSanityFetch.mockReset();
    mockClientFetch.mockReset();
  });

  it("getFilms returns film array", async () => {
    const films = [{ _id: "1", title: "Deep Blue" }];
    mockSanityFetch.mockResolvedValueOnce({ data: films });

    const result = await getFilms();
    expect(result).toEqual(films);
    expect(mockSanityFetch).toHaveBeenCalledTimes(1);
    expect(mockSanityFetch.mock.calls[0][0]).toHaveProperty("query");
  });

  it("getFilmBySlug passes slug param", async () => {
    mockSanityFetch.mockResolvedValueOnce({ data: null });
    const result = await getFilmBySlug("test-slug");
    expect(result).toBeNull();
    expect(mockSanityFetch.mock.calls[0][0].params).toEqual({
      slug: "test-slug",
    });
  });

  it("getAllFilmSlugs uses plain client.fetch (not sanityFetch)", async () => {
    mockClientFetch.mockResolvedValueOnce(["slug-a", "slug-b"]);

    const result = await getAllFilmSlugs();
    expect(result).toEqual(["slug-a", "slug-b"]);
    expect(mockClientFetch).toHaveBeenCalledTimes(1);
    expect(mockSanityFetch).not.toHaveBeenCalled();
  });

  it("getTeamMembers returns team member array", async () => {
    const members = [{ _id: "1", name: "Jane", role: "founder" }];
    mockSanityFetch.mockResolvedValueOnce({ data: members });

    const result = await getTeamMembers();
    expect(result).toEqual(members);
  });

  it("getPartners returns partner array", async () => {
    const partners = [{ _id: "1", name: "PanOcean", tier: "gold" }];
    mockSanityFetch.mockResolvedValueOnce({ data: partners });

    const result = await getPartners();
    expect(result).toEqual(partners);
  });

  it("getFeaturedPartners returns featured partners", async () => {
    mockSanityFetch.mockResolvedValueOnce({ data: [] });
    const result = await getFeaturedPartners();
    expect(result).toEqual([]);
  });

  it("getProgramContent passes slug param and returns null when empty", async () => {
    mockSanityFetch.mockResolvedValueOnce({ data: null });
    const result = await getProgramContent("photography");
    expect(result).toBeNull();
    expect(mockSanityFetch.mock.calls[0][0].params).toEqual({
      slug: "photography",
    });
  });
});
