import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-4 mt-6 text-xl font-bold text-foreground">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-5 text-lg font-bold text-foreground">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-base font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 leading-relaxed text-foreground">{children}</p>
  ),
  a: ({ href, children }: ComponentPropsWithoutRef<"a">) => (
    <a href={href} className="text-primary underline underline-offset-4 hover:text-primary/80" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 ml-6 list-disc space-y-1 text-foreground">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 ml-6 list-decimal space-y-1 text-foreground">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-3 border-l-4 border-border pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-lg bg-muted p-4 text-sm text-foreground">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">{children}</code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => <pre className="mb-3">{children}</pre>,
  hr: () => <hr className="my-6 border-border" />,
  img: ({ src, alt }: ComponentPropsWithoutRef<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element -- user-submitted markdown images have unknown dimensions
    <img src={src} alt={alt ?? ""} className="my-4 max-w-full rounded-lg" loading="lazy" />
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-3 py-2 text-foreground">{children}</td>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={components}
    >
      {content}
    </Markdown>
  );
}
