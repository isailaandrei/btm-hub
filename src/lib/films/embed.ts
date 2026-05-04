const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;
const VIMEO_ID_PATTERN = /^[0-9]+$/;

export type FilmEmbedState =
  | { status: "missing" }
  | { status: "unavailable" }
  | { status: "available"; url: string };

function cleanSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  const value = segment.trim();
  return value.length > 0 ? value : null;
}

export function getSafeFilmEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (hostname === "www.youtube.com" || hostname === "youtube.com") {
    const embedId =
      segments[0] === "embed" && segments.length === 2
        ? cleanSegment(segments[1])
        : segments[0] === "shorts" && segments.length === 2
          ? cleanSegment(segments[1])
          : segments[0] === "watch" && segments.length === 1
            ? cleanSegment(url.searchParams.get("v") ?? undefined)
            : null;

    if (!embedId || !YOUTUBE_ID_PATTERN.test(embedId)) return null;
    return `https://www.youtube.com/embed/${embedId}`;
  }

  if (hostname === "youtu.be") {
    if (segments.length !== 1) return null;
    const embedId = cleanSegment(segments[0]);
    if (!embedId || !YOUTUBE_ID_PATTERN.test(embedId)) return null;
    return `https://www.youtube.com/embed/${embedId}`;
  }

  if (hostname === "player.vimeo.com") {
    const videoId = segments[0] === "video" && segments.length === 2 ? cleanSegment(segments[1]) : null;
    if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  if (hostname === "vimeo.com") {
    if (segments.length !== 1) return null;
    const videoId = cleanSegment(segments[0]);
    if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  return null;
}

export function getFilmEmbedState(input: string | null | undefined): FilmEmbedState {
  if (!input?.trim()) return { status: "missing" };

  const url = getSafeFilmEmbedUrl(input);
  return url ? { status: "available", url } : { status: "unavailable" };
}
