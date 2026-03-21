import type { PortableTextComponents } from "@portabletext/react";
import Image from "next/image";
import { urlFor } from "@/lib/sanity/image";
import { isSafeUrl } from "@/lib/validation-helpers";

export const portableTextComponents: PortableTextComponents = {
  block: {
    h2: ({ children }) => (
      <h2 className="mt-8 mb-4 text-3xl font-bold text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-6 mb-3 text-2xl font-semibold text-foreground">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-4 mb-2 text-xl font-semibold text-foreground">
        {children}
      </h4>
    ),
    normal: ({ children }) => (
      <p className="mb-4 text-base leading-relaxed text-muted-foreground">
        {children}
      </p>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 border-l-4 border-primary pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
  },
  marks: {
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em>{children}</em>,
    link: ({ children, value }) => {
      const href = value?.href;
      if (!href || !isSafeUrl(href)) return <>{children}</>;
      return (
        <a
          href={href}
          target={href.startsWith("/") ? undefined : "_blank"}
          rel={href.startsWith("/") ? undefined : "noopener noreferrer"}
          className="text-primary underline transition-opacity hover:opacity-75"
        >
          {children}
        </a>
      );
    },
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mb-4 ml-6 list-disc space-y-1">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="mb-4 ml-6 list-decimal space-y-1">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-base text-muted-foreground">{children}</li>
    ),
    number: ({ children }) => (
      <li className="text-base text-muted-foreground">{children}</li>
    ),
  },
  types: {
    image: ({ value }) => {
      if (!value?.asset) return null;
      return (
        <figure className="my-6">
          <Image
            src={urlFor(value).width(1200).url()}
            alt={value.alt || ""}
            width={1200}
            height={675}
            className="rounded-lg"
          />
          {value.caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
  },
};
