import type { SanityImageSource } from "@sanity/image-url";
import { editAttr } from "../sanity/data-attribute";
import { urlFor } from "../sanity/image";
import { getFilmVideoInfo, getYouTubeThumbnailUrl } from "./embed";
import type { FilmBrowserCollection } from "./types";

/** Minimal shape of a Sanity image field needed to build a CDN URL. */
export type PosterImageSource = {
  asset?: { _ref?: string | null } | null;
} | null;

type FilmWithVideo = {
  _id: string;
  videoEmbed?: string | null;
  /** Optional editor-uploaded still; overrides the auto-derived video thumbnail. */
  poster?: PosterImageSource;
};

type FilmWithPoster<TFilm extends FilmWithVideo> = TFilm & {
  posterUrl: string | null;
  /** Set only when `posterUrl` resolved from the uploaded `poster` field — the
   *  `data-sanity` click-to-edit attribute for the card's poster. */
  posterEditAttr?: string;
};

/**
 * Builds a cropped Sanity CDN URL for an uploaded poster image, or null when no
 * image is set. Hotspot-aware crop to the requested dimensions; `auto("format")`
 * serves WebP/AVIF where supported.
 */
export function uploadedPosterImageUrl(
  poster: PosterImageSource | undefined,
  width: number,
  height: number,
): string | null {
  if (!poster?.asset?._ref) return null;
  return urlFor(poster as SanityImageSource)
    .width(width)
    .height(height)
    .fit("crop")
    .auto("format")
    .url();
}

/** Minimal shape needed to resolve a featured film's hero backdrop. */
type FilmHeroImageSource = {
  /** Dedicated wide, hi-res still uploaded for the hero. */
  backdrop?: PosterImageSource;
  /** 16:9 still shared with cards; second choice for the hero. */
  poster?: PosterImageSource;
  /** Already-resolved auto video thumbnail (lowest quality); last resort. */
  posterUrl?: string | null;
};

export type FilmHeroBackdrop = {
  url: string | null;
  /** Which source resolved: the Sanity field to open on click, or the
   *  non-editable auto thumbnail. */
  source: "backdrop" | "poster" | "video-thumbnail" | null;
};

/**
 * Resolves the Films-page hero backdrop URL for a featured film, in priority
 * order:
 *   1. the dedicated wide `backdrop` upload (the editor's hi-res still),
 *   2. the `poster` upload rendered at hero resolution (same as the prior
 *      behaviour, kept so films with only a poster don't regress),
 *   3. the auto-derived video thumbnail (`posterUrl`) — lowest quality, last.
 * Returns `{ url: null, source: null }` only when the film has none of the
 * three. `source` tells the caller which field actually rendered, so the
 * click-to-edit attribute can target it.
 */
export function filmHeroBackdrop(
  film: FilmHeroImageSource | null | undefined,
  width: number,
  height: number,
): FilmHeroBackdrop {
  const backdrop = uploadedPosterImageUrl(film?.backdrop, width, height);
  if (backdrop) return { url: backdrop, source: "backdrop" };
  const poster = uploadedPosterImageUrl(film?.poster, width, height);
  if (poster) return { url: poster, source: "poster" };
  if (film?.posterUrl) return { url: film.posterUrl, source: "video-thumbnail" };
  return { url: null, source: null };
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function getVimeoVideoIdForLog(oEmbedUrl: string): string {
  try {
    return new URL(oEmbedUrl).pathname.split("/").filter(Boolean)[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

// Bound the Vimeo oEmbed lookup so a slow/hung provider can't stall a render
// (the result is day-cached, so this only costs on a cache miss). On timeout the
// catch below logs a warning and returns null — the film just shows no poster.
const VIMEO_OEMBED_TIMEOUT_MS = 8000;

async function getVimeoThumbnailUrl(oEmbedUrl: string): Promise<string | null> {
  const endpoint = new URL("https://vimeo.com/api/oembed.json");
  endpoint.searchParams.set("url", oEmbedUrl);
  const videoId = getVimeoVideoIdForLog(oEmbedUrl);

  try {
    const response = await fetch(endpoint, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(VIMEO_OEMBED_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("Unable to resolve Vimeo thumbnail.", {
        videoId,
        status: response.status,
      });
      return null;
    }

    const payload = (await response.json()) as { thumbnail_url?: unknown };
    if (!isHttpsUrl(payload.thumbnail_url)) {
      console.warn("Vimeo oEmbed response did not include an HTTPS thumbnail.", {
        videoId,
      });
      return null;
    }

    return payload.thumbnail_url;
  } catch (error) {
    console.warn("Unable to resolve Vimeo thumbnail.", {
      videoId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

export async function resolveFilmPosterUrl(
  videoEmbed: string | null | undefined,
): Promise<string | null> {
  const video = getFilmVideoInfo(videoEmbed);
  if (!video) return null;

  if (video.provider === "youtube") {
    return getYouTubeThumbnailUrl(video.id);
  }

  return getVimeoThumbnailUrl(video.oEmbedUrl);
}

export async function withFilmPosterUrls<TFilm extends FilmWithVideo>(
  films: TFilm[],
): Promise<FilmWithPoster<TFilm>[]> {
  const posterUrlsByEmbed = new Map<string, Promise<string | null>>();

  return Promise.all(
    films.map(async (film) => {
      // An uploaded poster image always wins — it's the editor's high-quality
      // still — and resolves synchronously with no provider round-trip.
      const uploaded = uploadedPosterImageUrl(film.poster, 1200, 675);
      if (uploaded) {
        return {
          ...film,
          posterUrl: uploaded,
          posterEditAttr: editAttr(film._id, "film", "poster"),
        };
      }

      const videoEmbed = film.videoEmbed?.trim() ?? "";
      let posterUrlPromise = posterUrlsByEmbed.get(videoEmbed);

      if (!posterUrlPromise) {
        posterUrlPromise = resolveFilmPosterUrl(videoEmbed);
        posterUrlsByEmbed.set(videoEmbed, posterUrlPromise);
      }

      return {
        ...film,
        posterUrl: await posterUrlPromise,
      };
    }),
  );
}

export function withCollectionFilmPosterUrls(
  collections: FilmBrowserCollection[],
  posterUrlsByFilmId: Map<string, string | null>,
  posterEditAttrsByFilmId?: Map<string, string | undefined>,
): FilmBrowserCollection[] {
  return collections.map((collection) => ({
    ...collection,
    films:
      collection.films?.map((film) => ({
        ...film,
        posterUrl: posterUrlsByFilmId.get(film._id) ?? null,
        posterEditAttr: posterEditAttrsByFilmId?.get(film._id),
      })) ?? null,
  }));
}
