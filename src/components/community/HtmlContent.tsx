import { sanitizeBody } from "@/lib/community/sanitize";

export function HtmlContent({ content }: { content: string }) {
  const clean = sanitizeBody(content);
  return (
    <div
      className="prose-community"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
