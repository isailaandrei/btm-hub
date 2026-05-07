import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveFilmPosterUrl,
  withCollectionFilmPosterUrls,
  withFilmPosterUrls,
} from "./posters";

describe("resolveFilmPosterUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses YouTube's public thumbnail without an extra fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveFilmPosterUrl("https://www.youtube.com/watch?v=abc123DEF45"),
    ).resolves.toBe("https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Vimeo oEmbed thumbnails for Vimeo videos", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        thumbnail_url: "https://i.vimeocdn.com/video/123456789-abcd",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveFilmPosterUrl("https://vimeo.com/123456789"),
    ).resolves.toBe("https://i.vimeocdn.com/video/123456789-abcd");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123456789",
    );
  });

  it("keeps Vimeo unlisted hashes when asking oEmbed for thumbnails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        thumbnail_url: "https://i.vimeocdn.com/video/123456789-abcd",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveFilmPosterUrl("https://vimeo.com/123456789/abcDEF123"),
    ).resolves.toBe("https://i.vimeocdn.com/video/123456789-abcd");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123456789%2FabcDEF123",
    );
  });

  it("returns null for unsupported or unavailable thumbnails", async () => {
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveFilmPosterUrl("https://example.com/video")).resolves.toBe(
      null,
    );
    await expect(resolveFilmPosterUrl("https://vimeo.com/123456789")).resolves.toBe(
      null,
    );
    expect(warnMock).toHaveBeenCalledWith("Unable to resolve Vimeo thumbnail.", {
      videoId: "123456789",
      status: 404,
    });
  });
});

describe("withFilmPosterUrls", () => {
  it("adds poster URLs to films and reuses duplicate Vimeo lookups", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        thumbnail_url: "https://i.vimeocdn.com/video/123456789-abcd",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      withFilmPosterUrls([
        { _id: "1", videoEmbed: "https://vimeo.com/123456789" },
        { _id: "2", videoEmbed: "https://vimeo.com/123456789" },
      ]),
    ).resolves.toEqual([
      {
        _id: "1",
        videoEmbed: "https://vimeo.com/123456789",
        posterUrl: "https://i.vimeocdn.com/video/123456789-abcd",
      },
      {
        _id: "2",
        videoEmbed: "https://vimeo.com/123456789",
        posterUrl: "https://i.vimeocdn.com/video/123456789-abcd",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("withCollectionFilmPosterUrls", () => {
  it("copies already-resolved poster URLs onto collection films", () => {
    expect(
      withCollectionFilmPosterUrls(
        [{ _id: "collection-1", films: [{ _id: "film-1" }] }],
        new Map([["film-1", "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg"]]),
      ),
    ).toEqual([
      {
        _id: "collection-1",
        films: [
          {
            _id: "film-1",
            posterUrl: "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg",
          },
        ],
      },
    ]);
  });
});
