import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s",
  "h1", "h2", "h3",
  "ul", "ol", "li",
  "a", "img",
  "blockquote", "code", "pre",
  "hr",
  "span", // for @mentions
];

const ALLOWED_ATTRIBUTES: Record<string, sanitizeHtml.AllowedAttribute[]> = {
  a: ["href", "target", "rel"],
  img: ["src", "alt"],
  span: [
    { name: "class", values: ["mention"] },
    { name: "data-type", values: ["mention"] },
    "data-id",
    "data-label",
  ],
};

export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}
