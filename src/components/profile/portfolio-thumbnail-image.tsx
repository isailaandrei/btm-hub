"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";

export function PortfolioThumbnailImage({
  thumbnailUrl,
  fallbackUrl,
  alt,
  className,
  loading = "lazy",
}: {
  thumbnailUrl: string;
  fallbackUrl: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(
    null,
  );
  const usedFallback = failedThumbnailUrl === thumbnailUrl;
  const src = usedFallback ? fallbackUrl : thumbnailUrl;

  const switchToFallback = useCallback(() => {
    if (usedFallback || src === fallbackUrl) return;
    setFailedThumbnailUrl(thumbnailUrl);
  }, [fallbackUrl, src, thumbnailUrl, usedFallback]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || usedFallback || src === fallbackUrl) return;
    if (!image.complete || image.naturalWidth > 0) return;

    const frame = window.requestAnimationFrame(switchToFallback);
    return () => window.cancelAnimationFrame(frame);
  }, [fallbackUrl, src, switchToFallback, usedFallback]);

  return (
    <img
      ref={imageRef}
      src={src}
      data-fallback-src={fallbackUrl}
      data-thumbnail-fallback={usedFallback ? "original" : undefined}
      alt={alt}
      loading={loading}
      className={className}
      onError={switchToFallback}
    />
  );
}
