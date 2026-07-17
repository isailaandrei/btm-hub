import Image from "next/image";
import { urlFor } from "@/lib/sanity/image";
import type { SanityImageSource } from "@sanity/image-url";

interface SanityImageProps {
  source: SanityImageSource | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /**
   * `data-sanity` edit attribute (from {@link editAttr}) that makes the image
   * click-to-edit in the Studio Presentation tool. Inert in production.
   */
  dataSanity?: string;
}

export function SanityImage({
  source,
  alt,
  width = 800,
  height = 600,
  fill,
  className,
  priority,
  sizes,
  dataSanity,
}: SanityImageProps) {
  if (!source) return null;

  const url = fill
    ? urlFor(source).width(1920).fit("crop").crop("focalpoint").quality(80).auto("format").url()
    : urlFor(source).width(width).height(height).auto("format").url();

  if (fill) {
    return (
      <Image
        src={url}
        alt={alt}
        fill
        className={className}
        priority={priority}
        sizes={sizes ?? "100vw"}
        data-sanity={dataSanity}
      />
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      sizes={sizes}
      data-sanity={dataSanity}
    />
  );
}
