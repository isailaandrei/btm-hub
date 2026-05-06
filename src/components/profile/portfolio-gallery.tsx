/* eslint-disable @next/next/no-img-element */

import type { ProfilePortfolioItemWithUrl } from "@/types/database";

function formatUploadDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PortfolioGallery({
  items,
  compact = false,
}: {
  items: ProfilePortfolioItemWithUrl[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className="w-full">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Portfolio
      </h2>
      <div
        className={
          compact
            ? "grid grid-cols-2 gap-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3"
        }
      >
        {items.map((item) => (
          <figure key={item.id} className="min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
              {item.signedUrl ? (
                <img
                  src={item.signedUrl}
                  alt={item.title || item.original_filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-destructive">
                  {item.imageError ?? "Image unavailable."}
                </div>
              )}
            </div>
            <figcaption className="mt-2 text-left">
              {item.title && (
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
              )}
              {item.caption && (
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                  {item.caption}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Uploaded {formatUploadDate(item.created_at)}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
