import { MarkdownContent } from "./MarkdownContent";
import { HtmlContent } from "./HtmlContent";
import type { BodyFormat } from "@/types/database";

export function PostBody({
  body,
  bodyFormat,
}: {
  body: string;
  bodyFormat: BodyFormat;
}) {
  if (bodyFormat === "html") return <HtmlContent content={body} />;
  return <MarkdownContent content={body} />;
}
