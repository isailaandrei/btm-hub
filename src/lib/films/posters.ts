import { getFilmVideoInfo, getYouTubeThumbnailUrl } from "./embed";
import type { FilmBrowserCollection } from "./types";

type FilmWithVideo = {
  _id: string;
  videoEmbed?: string | null;
};

type FilmWithPoster<TFilm extends FilmWithVideo> = TFilm & {
  posterUrl: string | null;
};

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

async function getVimeoThumbnailUrl(oEmbedUrl: string): Promise<string | null> {
  const endpoint = new URL("https://vimeo.com/api/oembed.json");
  endpoint.searchParams.set("url", oEmbedUrl);
  const videoId = getVimeoVideoIdForLog(oEmbedUrl);

  try {
    const response = await fetch(endpoint, { next: { revalidate: 86400 } });
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
): FilmBrowserCollection[] {
  return collections.map((collection) => ({
    ...collection,
    films:
      collection.films?.map((film) => ({
        ...film,
        posterUrl: posterUrlsByFilmId.get(film._id) ?? null,
      })) ?? null,
  }));
}
