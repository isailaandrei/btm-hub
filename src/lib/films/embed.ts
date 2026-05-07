const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;
const VIMEO_ID_PATTERN = /^[0-9]+$/;
const VIMEO_HASH_PATTERN = /^[a-zA-Z0-9]+$/;

export type FilmEmbedState =
  | { status: "missing" }
  | { status: "unavailable" }
  | { status: "available"; url: string };

export type FilmVideoInfo =
  | { provider: "youtube"; id: string; embedUrl: string }
  | { provider: "vimeo"; id: string; embedUrl: string; oEmbedUrl: string };

function cleanSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  const value = segment.trim();
  return value.length > 0 ? value : null;
}

function cleanVimeoHash(value: string | null | undefined): string | null {
  const hash = cleanSegment(value ?? undefined);
  return hash && VIMEO_HASH_PATTERN.test(hash) ? hash : null;
}

function buildVimeoEmbedUrl(videoId: string, hash: string | null): string {
  const embedUrl = new URL(`https://player.vimeo.com/video/${videoId}`);
  if (hash) embedUrl.searchParams.set("h", hash);
  return embedUrl.toString();
}

function buildVimeoOEmbedUrl(videoId: string, hash: string | null): string {
  return `https://vimeo.com/${videoId}${hash ? `/${hash}` : ""}`;
}

export function getFilmVideoInfo(
  input: string | null | undefined,
): FilmVideoInfo | null {
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
    return {
      provider: "youtube",
      id: embedId,
      embedUrl: `https://www.youtube.com/embed/${embedId}`,
    };
  }

  if (hostname === "youtu.be") {
    if (segments.length !== 1) return null;
    const embedId = cleanSegment(segments[0]);
    if (!embedId || !YOUTUBE_ID_PATTERN.test(embedId)) return null;
    return {
      provider: "youtube",
      id: embedId,
      embedUrl: `https://www.youtube.com/embed/${embedId}`,
    };
  }

  if (hostname === "player.vimeo.com") {
    const videoId =
      segments[0] === "video" && segments.length === 2
        ? cleanSegment(segments[1])
        : null;
    if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) return null;
    const hash = cleanVimeoHash(url.searchParams.get("h"));
    return {
      provider: "vimeo",
      id: videoId,
      embedUrl: buildVimeoEmbedUrl(videoId, hash),
      oEmbedUrl: buildVimeoOEmbedUrl(videoId, hash),
    };
  }

  if (hostname === "vimeo.com") {
    if (segments.length < 1 || segments.length > 2) return null;
    const videoId = cleanSegment(segments[0]);
    if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) return null;
    const hash = segments.length === 2 ? cleanVimeoHash(segments[1]) : null;
    if (segments.length === 2 && !hash) return null;
    return {
      provider: "vimeo",
      id: videoId,
      embedUrl: buildVimeoEmbedUrl(videoId, hash),
      oEmbedUrl: buildVimeoOEmbedUrl(videoId, hash),
    };
  }

  return null;
}

export function getSafeFilmEmbedUrl(input: string | null | undefined): string | null {
  return getFilmVideoInfo(input)?.embedUrl ?? null;
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getFilmEmbedState(input: string | null | undefined): FilmEmbedState {
  if (!input?.trim()) return { status: "missing" };

  const url = getSafeFilmEmbedUrl(input);
  return url ? { status: "available", url } : { status: "unavailable" };
}
