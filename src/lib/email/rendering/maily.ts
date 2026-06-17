import { Maily, type JSONContent } from "@maily-to/render";
import {
  flattenEmailVariables,
  interpolateEmailVariables,
  type EmailRenderVariables,
} from "./variables";

export type MailyDocument = JSONContent & {
  type: "doc";
  content: JSONContent[];
  /**
   * Optional per-template email width (the container's max-width, in px). Stored
   * alongside the document in builder_json so it travels through preview, save,
   * and send. Falls back to DEFAULT_EMAIL_WIDTH when absent.
   */
  maxWidth?: number;
};

export const DEFAULT_EMAIL_WIDTH = 680;
export const MIN_EMAIL_WIDTH = 320;
export const MAX_EMAIL_WIDTH = 900;

/** Clamp an arbitrary width input to the allowed email-container range. */
export function clampEmailWidth(value: unknown): number {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return DEFAULT_EMAIL_WIDTH;
  return Math.min(MAX_EMAIL_WIDTH, Math.max(MIN_EMAIL_WIDTH, Math.round(numeric)));
}

/** Resolve the effective container width for a document (clamped, with default). */
export function getMailyDocumentWidth(document: MailyDocument): number {
  return document.maxWidth == null
    ? DEFAULT_EMAIL_WIDTH
    : clampEmailWidth(document.maxWidth);
}

export interface RenderedEmailBody {
  html: string;
  text: string;
}

export interface RenderedEmail extends RenderedEmailBody {
  subject: string;
}

// System font stack — renders identically in every client (no webfont download).
// `fontFamily` is emitted quoted by @maily-to/render, so the PRIMARY family goes
// there and the rest of the stack goes in `fallbackFontFamily` (emitted unquoted).
// `webFont: undefined` is required to strip the library's default Inter @font-face;
// the deep-merge in setTheme keeps the default webFont otherwise.
const SYSTEM_FONT = {
  fontFamily: "-apple-system",
  fallbackFontFamily:
    "BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  webFont: undefined,
};

const DEFAULT_EMAIL_RENDER_THEME = {
  font: SYSTEM_FONT,
  body: {
    backgroundColor: "#f3f4f6",
    paddingTop: "32px",
    paddingRight: "16px",
    paddingBottom: "32px",
    paddingLeft: "16px",
  },
  container: {
    backgroundColor: "#ffffff",
    maxWidth: "680px",
    minWidth: "300px",
    paddingTop: "32px",
    paddingRight: "32px",
    paddingBottom: "32px",
    paddingLeft: "32px",
    borderRadius: "12px",
    borderWidth: "0px",
    borderColor: "transparent",
  },
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertMailyDocument(value: unknown): MailyDocument {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    throw new Error("Invalid Maily document");
  }
  return cloneJson(value) as MailyDocument;
}

export function createDefaultMailyDocument(input: {
  imageUrl?: string;
  imageAssetId?: string;
} = {}): MailyDocument {
  // Content flows inside the container's padding (full-width banners are not the
  // global default — they'd require zeroing that padding, which strips the gutter
  // from every other template). height "auto" keeps an inserted banner image
  // proportional on mobile.
  const content: JSONContent[] = [
    ...(input.imageUrl
      ? [
          {
            type: "image",
            attrs: {
              src: input.imageUrl,
              assetId: input.imageAssetId,
              alt: "Behind The Mask",
              alignment: "center",
              width: "auto",
              height: "auto",
              borderRadius: 8,
            },
          },
        ]
      : []),
    {
      type: "heading",
      attrs: {
        level: 1,
        textAlign: "left",
        textDirection: "ltr",
      },
      content: [{ type: "text", text: "Hello " }, contactNameVariable()],
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        textDirection: "ltr",
      },
      content: [
        {
          type: "text",
          text: "Write your message here. You can keep this as a simple note or use Maily blocks to add images, buttons, columns, and visual sections.",
        },
      ],
    },
    {
      type: "button",
      attrs: {
        text: "Learn more",
        url: "https://behind-the-mask.com",
        variant: "filled",
        buttonColor: "#111827",
        textColor: "#ffffff",
        borderRadius: "smooth",
        alignment: "left",
        paddingTop: 10,
        paddingRight: 32,
        paddingBottom: 10,
        paddingLeft: 32,
      },
    },
    {
      type: "footer",
      attrs: {
        textAlign: "left",
        textDirection: "ltr",
      },
      content: [
        {
          type: "text",
          text: "Behind The Mask",
        },
      ],
    },
  ];

  return { type: "doc", content };
}

function contactNameVariable(): JSONContent {
  return {
    type: "variable",
    attrs: {
      id: "contact.name",
      label: "contact.name",
      fallback: "there",
      required: false,
    },
  };
}

/**
 * Force every image node to render with `height: auto`.
 *
 * Maily emits images as `<img style="width:{N}px; height:{N}px; max-width:100%">`.
 * When the editor stores an explicit pixel height (it does whenever an image is
 * drag-resized), `max-width:100%` shrinks the width on narrow screens but the
 * fixed height stays put — so the image squashes on mobile. Setting the height
 * to "auto" lets the browser scale it proportionally. We normalize at render
 * time (non-destructively) so the stored builder JSON is untouched but every
 * rendered email — preview, template, and sent message — is responsive.
 *
 * `logo` and `inlineImage` nodes are intentionally left alone (they are meant to
 * be fixed-size).
 */
function withResponsiveImages(document: MailyDocument): MailyDocument {
  const clone = cloneJson(document);

  function visit(node: JSONContent) {
    if (node.type === "image" && isRecord(node.attrs)) {
      node.attrs.height = "auto";
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  }

  visit(clone);
  return clone;
}

export function parseMailyDocumentOrDefault(value: unknown): MailyDocument {
  try {
    return assertMailyDocument(value);
  } catch {
    return createDefaultMailyDocument();
  }
}

export async function renderMailyDocument(
  document: MailyDocument,
  input: {
    previewText?: string;
    variables?: EmailRenderVariables;
  } = {},
): Promise<RenderedEmailBody> {
  const normalized = withResponsiveImages(assertMailyDocument(document));
  const renderer = new Maily(normalized);
  renderer.setTheme({
    ...DEFAULT_EMAIL_RENDER_THEME,
    container: {
      ...DEFAULT_EMAIL_RENDER_THEME.container,
      maxWidth: `${getMailyDocumentWidth(normalized)}px`,
    },
  });
  if (input.previewText) {
    renderer.setPreviewText(input.previewText);
  }
  if (input.variables) {
    renderer.setVariableValues(flattenEmailVariables(input.variables));
  }

  const [html, text] = await Promise.all([
    renderer.render({ pretty: true }),
    renderer.render({ plainText: true }),
  ]);
  return { html, text };
}

export async function renderMailyEmail(input: {
  subject: string;
  previewText?: string;
  document: MailyDocument;
  variables: EmailRenderVariables;
}): Promise<RenderedEmail> {
  const rendered = await renderMailyDocument(input.document, {
    previewText: input.previewText
      ? interpolateEmailVariables(input.previewText, input.variables)
      : undefined,
    variables: input.variables,
  });
  return {
    subject: interpolateEmailVariables(input.subject, input.variables),
    html: rendered.html,
    text: rendered.text,
  };
}

export function getAssetIdsForMailyDocument(document: MailyDocument): string[] {
  const ids = new Set<string>();

  function visit(node: unknown) {
    if (!isRecord(node)) return;
    const attrs = isRecord(node.attrs) ? node.attrs : null;
    if (typeof attrs?.assetId === "string" && attrs.assetId.trim()) {
      ids.add(attrs.assetId.trim());
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  }

  visit(document);
  return [...ids];
}

export function getAssetPublicUrlsForMailyDocument(
  document: MailyDocument,
): string[] {
  const urls = new Set<string>();

  function visit(node: unknown) {
    if (!isRecord(node)) return;
    const attrs = isRecord(node.attrs) ? node.attrs : null;
    if (typeof attrs?.src === "string" && attrs.src.trim()) {
      urls.add(attrs.src.trim());
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  }

  visit(document);
  return [...urls];
}
