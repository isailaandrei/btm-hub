"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const signedItems = useMemo(
    () => items.filter((item) => Boolean(item.signedUrl)),
    [items],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedItem =
    selectedIndex === null ? null : signedItems[selectedIndex] ?? null;
  const hasMultipleImages = signedItems.length > 1;

  function openItem(itemId: string) {
    const nextIndex = signedItems.findIndex((item) => item.id === itemId);
    if (nextIndex !== -1) setSelectedIndex(nextIndex);
  }

  const closeLightbox = useCallback(function closeLightbox() {
    setSelectedIndex(null);
  }, []);

  const showPrevious = useCallback(function showPrevious() {
    if (!hasMultipleImages) return;
    setSelectedIndex((current) => {
      if (current === null) return current;
      return current === 0 ? signedItems.length - 1 : current - 1;
    });
  }, [hasMultipleImages, signedItems.length]);

  const showNext = useCallback(function showNext() {
    if (!hasMultipleImages) return;
    setSelectedIndex((current) => {
      if (current === null) return current;
      return current === signedItems.length - 1 ? 0 : current + 1;
    });
  }, [hasMultipleImages, signedItems.length]);

  useEffect(() => {
    if (selectedIndex === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeLightbox, selectedIndex, showNext, showPrevious]);

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
                <button
                  type="button"
                  aria-label={`Open ${item.title || item.original_filename} in gallery`}
                  onClick={() => openItem(item.id)}
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
                </button>
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

      {selectedItem?.signedUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Portfolio image gallery"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div
            className="relative flex max-h-full w-full max-w-6xl flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {selectedItem.title || selectedItem.original_filename}
                </p>
                {hasMultipleImages && selectedIndex !== null && (
                  <p>
                    {selectedIndex + 1} of {signedItems.length}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close gallery"
                onClick={closeLightbox}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="relative flex min-h-0 items-center justify-center">
              {hasMultipleImages && (
                <button
                  type="button"
                  aria-label="Previous portfolio image"
                  onClick={showPrevious}
                  className="absolute left-2 z-10 inline-flex size-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
              )}

              <img
                src={selectedItem.signedUrl}
                alt={selectedItem.title || selectedItem.original_filename}
                className="max-h-[78vh] w-auto max-w-full rounded-md object-contain shadow-lg"
              />

              {hasMultipleImages && (
                <button
                  type="button"
                  aria-label="Next portfolio image"
                  onClick={showNext}
                  className="absolute right-2 z-10 inline-flex size-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
              )}
            </div>

            {selectedItem.caption && (
              <p className="text-sm text-muted-foreground">
                {selectedItem.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
