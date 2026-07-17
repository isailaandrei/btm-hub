import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filmHeroBackdrop,
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return {
        ok: true,
        json: async () => ({
          thumbnail_url: "https://i.vimeocdn.com/video/123456789-abcd",
        }),
      };
    });
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return {
        ok: true,
        json: async () => ({
          thumbnail_url: "https://i.vimeocdn.com/video/123456789-abcd",
        }),
      };
    });
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

  it("prefers an uploaded poster image over the auto video thumbnail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const [film] = await withFilmPosterUrls([
      {
        _id: "1",
        videoEmbed: "https://www.youtube.com/watch?v=abc123DEF45",
        poster: { asset: { _ref: "image-poster123-1920x1080-jpg" } },
      },
    ]);

    expect(film.posterUrl).toContain("cdn.sanity.io");
    expect(film.posterUrl).toContain("poster123");
    expect(film.posterUrl).toContain("w=1200");
    // The uploaded still wins; no provider thumbnail is used or fetched.
    expect(film.posterUrl).not.toContain("ytimg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches a posterEditAttr when the uploaded poster resolved", async () => {
    const [film] = await withFilmPosterUrls([
      {
        _id: "film-1",
        videoEmbed: null,
        poster: { asset: { _ref: "image-poster123-1920x1080-jpg" } },
      },
    ]);

    expect(film.posterEditAttr).toBeDefined();
  });

  it("leaves posterEditAttr undefined on the auto-thumbnail path", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        thumbnail_url: "https://i.vimeocdn.com/video/123456789-abcd",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [film] = await withFilmPosterUrls([
      { _id: "film-1", videoEmbed: "https://vimeo.com/123456789" },
    ]);

    expect(film.posterEditAttr).toBeUndefined();
  });
});

describe("filmHeroBackdrop", () => {
  const backdrop = { asset: { _ref: "image-backdropimg-2560x1440-jpg" } };
  const poster = { asset: { _ref: "image-posterimg-1920x1080-jpg" } };
  const thumb = "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg";

  it("prefers the dedicated hero backdrop upload", () => {
    const { url, source } = filmHeroBackdrop(
      { backdrop, poster, posterUrl: thumb },
      2400,
      1350,
    );
    expect(url).toContain("cdn.sanity.io");
    expect(url).toContain("backdropimg");
    expect(url).toContain("w=2400");
    expect(url).not.toContain("posterimg");
    expect(url).not.toContain("ytimg");
    expect(source).toBe("backdrop");
  });

  it("falls back to the poster (at hero resolution) when no backdrop is set", () => {
    const { url, source } = filmHeroBackdrop(
      { poster, posterUrl: thumb },
      2400,
      1350,
    );
    expect(url).toContain("cdn.sanity.io");
    expect(url).toContain("posterimg");
    expect(url).toContain("w=2400");
    expect(url).not.toContain("ytimg");
    expect(source).toBe("poster");
  });

  it("falls back to the auto video thumbnail when there is no upload", () => {
    const { url, source } = filmHeroBackdrop({ posterUrl: thumb }, 2400, 1350);
    expect(url).toBe(thumb);
    expect(source).toBe("video-thumbnail");
  });

  it("returns a null url and source when the film has no backdrop, poster or thumbnail", () => {
    expect(filmHeroBackdrop({}, 2400, 1350)).toEqual({ url: null, source: null });
    expect(filmHeroBackdrop({ posterUrl: null }, 2400, 1350)).toEqual({
      url: null,
      source: null,
    });
    expect(filmHeroBackdrop(null, 2400, 1350)).toEqual({ url: null, source: null });
    expect(filmHeroBackdrop(undefined, 2400, 1350)).toEqual({
      url: null,
      source: null,
    });
  });
});

describe("withCollectionFilmPosterUrls", () => {
  it("copies already-resolved poster URLs onto collection films", () => {
    expect(
      withCollectionFilmPosterUrls(
        [{ _id: "collection-1", title: null, films: [{ _id: "film-1", title: null }] }],
        new Map([["film-1", "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg"]]),
      ),
    ).toEqual([
      {
        _id: "collection-1",
        title: null,
        films: [
          {
            _id: "film-1",
            title: null,
            posterUrl: "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg",
          },
        ],
      },
    ]);
  });
});
