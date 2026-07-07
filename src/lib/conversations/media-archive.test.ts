import { describe, expect, it } from "vitest";
import {
  MEDIA_MAX_ATTEMPTS,
  extensionForContentType,
  nextStateAfterFailure,
  normalizeContentType,
  storagePathFor,
} from "./media-archive";

describe("normalizeContentType", () => {
  it("strips codec parameters and lowercases", () => {
    expect(normalizeContentType("audio/ogg; codecs=opus")).toBe("audio/ogg");
    expect(normalizeContentType("Image/JPEG")).toBe("image/jpeg");
  });

  it("returns null for empty input", () => {
    expect(normalizeContentType(null)).toBeNull();
    expect(normalizeContentType("")).toBeNull();
    expect(normalizeContentType("; codecs=opus")).toBeNull();
  });
});

describe("extensionForContentType", () => {
  it("maps WhatsApp media mimes", () => {
    expect(extensionForContentType("image/jpeg")).toBe(".jpg");
    expect(extensionForContentType("audio/ogg; codecs=opus")).toBe(".ogg");
    expect(extensionForContentType("video/mp4")).toBe(".mp4");
    expect(extensionForContentType("application/pdf")).toBe(".pdf");
  });

  it("falls back to no extension for unknown types", () => {
    expect(extensionForContentType("application/x-unknown")).toBe("");
    expect(extensionForContentType(null)).toBe("");
  });
});

describe("storagePathFor", () => {
  it("builds a stable message-scoped path", () => {
    expect(storagePathFor("msg-1", 0, "image/jpeg")).toBe(
      "messages/msg-1/0.jpg",
    );
    expect(storagePathFor("msg-1", 2, "application/x-unknown")).toBe(
      "messages/msg-1/2",
    );
  });
});

describe("nextStateAfterFailure", () => {
  it("marks upstream 404/403/410 as permanently expired regardless of attempts", () => {
    for (const httpStatus of [404, 403, 410]) {
      const next = nextStateAfterFailure({
        httpStatus,
        attempts: 0,
        message: "gone",
      });
      expect(next.status).toBe("expired");
      expect(next.attempts).toBe(1);
      expect(next.lastError).toContain(String(httpStatus));
    }
  });

  it("keeps transient failures pending until the attempt cap", () => {
    const next = nextStateAfterFailure({
      httpStatus: 500,
      attempts: 0,
      message: "Upstream HTTP 500",
    });
    expect(next).toEqual({
      status: "pending",
      attempts: 1,
      lastError: "Upstream HTTP 500",
    });
  });

  it("parks as failed once attempts are exhausted", () => {
    const next = nextStateAfterFailure({
      httpStatus: null,
      attempts: MEDIA_MAX_ATTEMPTS - 1,
      message: "Fetch failed: timeout",
    });
    expect(next.status).toBe("failed");
    expect(next.attempts).toBe(MEDIA_MAX_ATTEMPTS);
  });
});
