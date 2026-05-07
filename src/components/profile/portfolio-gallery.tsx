/* eslint-disable @next/next/no-img-element */

import { Maximize2 } from "lucide-react";
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
                <a
                  href={item.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${item.title || item.original_filename} full size`}
                  className="group block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <img
                    src={item.signedUrl}
                    alt={item.title || item.original_filename}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 className="size-4" aria-hidden="true" />
                  </span>
                </a>
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
