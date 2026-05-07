import { describe, expect, it } from "vitest";
import {
  getFilmEmbedState,
  getFilmVideoInfo,
  getSafeFilmEmbedUrl,
  getYouTubeThumbnailUrl,
} from "./embed";

describe("getSafeFilmEmbedUrl", () => {
  it("normalizes YouTube watch URLs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/watch?v=abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("normalizes youtu.be URLs", () => {
    expect(getSafeFilmEmbedUrl("https://youtu.be/abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("normalizes YouTube shorts URLs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/shorts/abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("accepts existing YouTube embed URLs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/embed/abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("normalizes Vimeo URLs", () => {
    expect(getSafeFilmEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("accepts existing Vimeo player URLs", () => {
    expect(getSafeFilmEmbedUrl("https://player.vimeo.com/video/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("preserves Vimeo unlisted hashes in embed URLs", () => {
    expect(getSafeFilmEmbedUrl("https://vimeo.com/123456789/abcDEF123")).toBe(
      "https://player.vimeo.com/video/123456789?h=abcDEF123",
    );
    expect(
      getSafeFilmEmbedUrl("https://player.vimeo.com/video/123456789?h=abcDEF123"),
    ).toBe("https://player.vimeo.com/video/123456789?h=abcDEF123");
  });

  it("trims surrounding whitespace and strips query/hash from canonical output", () => {
    expect(getSafeFilmEmbedUrl(" https://youtu.be/abc123DEF45?t=12#clip ")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("rejects non-https URLs", () => {
    expect(getSafeFilmEmbedUrl("http://www.youtube.com/watch?v=abc123DEF45")).toBeNull();
  });

  it("rejects unsupported hosts", () => {
    expect(getSafeFilmEmbedUrl("https://example.com/video")).toBeNull();
  });

  it("rejects allowlisted hosts with missing or malformed IDs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/watch")).toBeNull();
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/embed/abc123DEF45/extra")).toBeNull();
    expect(getSafeFilmEmbedUrl("https://vimeo.com/not-a-number")).toBeNull();
    expect(getSafeFilmEmbedUrl("https://player.vimeo.com/video/123456789/extra")).toBeNull();
  });
});

describe("getFilmEmbedState", () => {
  it("distinguishes missing, invalid, and playable embed URLs", () => {
    expect(getFilmEmbedState(null)).toEqual({ status: "missing" });
    expect(getFilmEmbedState("https://example.com/video")).toEqual({
      status: "unavailable",
    });
    expect(getFilmEmbedState("https://youtu.be/abc123DEF45")).toEqual({
      status: "available",
      url: "https://www.youtube.com/embed/abc123DEF45",
    });
  });
});

describe("getFilmVideoInfo", () => {
  it("returns provider metadata used by poster resolution", () => {
    expect(getFilmVideoInfo("https://youtu.be/abc123DEF45")).toEqual({
      provider: "youtube",
      id: "abc123DEF45",
      embedUrl: "https://www.youtube.com/embed/abc123DEF45",
    });
    expect(getFilmVideoInfo("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      id: "123456789",
      embedUrl: "https://player.vimeo.com/video/123456789",
      oEmbedUrl: "https://vimeo.com/123456789",
    });
  });

  it("returns the full Vimeo oEmbed source URL for unlisted videos", () => {
    expect(getFilmVideoInfo("https://vimeo.com/123456789/abcDEF123")).toEqual({
      provider: "vimeo",
      id: "123456789",
      embedUrl: "https://player.vimeo.com/video/123456789?h=abcDEF123",
      oEmbedUrl: "https://vimeo.com/123456789/abcDEF123",
    });
  });
});

describe("getYouTubeThumbnailUrl", () => {
  it("builds a stable public YouTube thumbnail URL", () => {
    expect(getYouTubeThumbnailUrl("abc123DEF45")).toBe(
      "https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg",
    );
  });
});
