import { describe, expect, it } from "vitest";
import { getSafeFilmEmbedUrl } from "./embed";

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
