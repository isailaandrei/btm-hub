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
   * Optional per-template layout, stored alongside the document in builder_json
   * so it travels through preview, save, and send. All fall back to defaults.
   * - maxWidth: the container max-width (px).
   * - paddingTop / paddingBottom: the container's vertical padding (px). Set
   *   paddingTop to 0 for a banner flush to the top of the card.
   */
  maxWidth?: number;
  paddingTop?: number;
  paddingBottom?: number;
  /** Whole-email font, by key into EMAIL_FONTS. Defaults to the system stack. */
  fontKey?: string;
  /** Card (container) background color, hex. Defaults to white. */
  containerBackground?: string;
  /** Backdrop the card sits on (the area around the email), hex. Light gray. */
  bodyBackground?: string;
};

export const DEFAULT_EMAIL_WIDTH = 680;
export const MIN_EMAIL_WIDTH = 320;
export const MAX_EMAIL_WIDTH = 900;

export const DEFAULT_EMAIL_PADDING = 32;
export const MIN_EMAIL_PADDING = 0;
export const MAX_EMAIL_PADDING = 96;

export const DEFAULT_CONTAINER_BACKGROUND = "#ffffff";
export const DEFAULT_BODY_BACKGROUND = "#f3f4f6";

/** Accept only #rrggbb so a stored value can't inject into the email's inline
 *  styles or the editor CSS (and stays valid for the native color input);
 *  anything else falls back to the default. */
export function normalizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}

/** Clamp an arbitrary width input to the allowed email-container range. */
export function clampEmailWidth(value: unknown): number {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return DEFAULT_EMAIL_WIDTH;
  return Math.min(MAX_EMAIL_WIDTH, Math.max(MIN_EMAIL_WIDTH, Math.round(numeric)));
}

/** Clamp an arbitrary vertical-padding input to the allowed range. */
export function clampEmailPadding(value: unknown): number {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return DEFAULT_EMAIL_PADDING;
  return Math.min(
    MAX_EMAIL_PADDING,
    Math.max(MIN_EMAIL_PADDING, Math.round(numeric)),
  );
}

/** Resolve the effective container width for a document (clamped, with default). */
export function getMailyDocumentWidth(document: MailyDocument): number {
  return document.maxWidth == null
    ? DEFAULT_EMAIL_WIDTH
    : clampEmailWidth(document.maxWidth);
}

export function getMailyDocumentPaddingTop(document: MailyDocument): number {
  return document.paddingTop == null
    ? DEFAULT_EMAIL_PADDING
    : clampEmailPadding(document.paddingTop);
}

export function getMailyDocumentPaddingBottom(document: MailyDocument): number {
  return document.paddingBottom == null
    ? DEFAULT_EMAIL_PADDING
    : clampEmailPadding(document.paddingBottom);
}

export function getMailyDocumentContainerBackground(
  document: MailyDocument,
): string {
  return normalizeHexColor(
    document.containerBackground,
    DEFAULT_CONTAINER_BACKGROUND,
  );
}

export function getMailyDocumentBodyBackground(document: MailyDocument): string {
  return normalizeHexColor(document.bodyBackground, DEFAULT_BODY_BACKGROUND);
}

/**
 * Email-safe font stacks an admin can pick from for a whole message. Custom or
 * Google web fonts can't be relied on in email (Outlook ignores @font-face,
 * Gmail strips it), so every option is a system/web-safe stack that renders
 * without a download. `fontFamily` is the PRIMARY family (emitted quoted by
 * @maily-to/render); the rest of the stack goes in `fallbackFontFamily`
 * (emitted unquoted). `cssStack` is the full family for the editor canvas.
 */
export interface EmailFontOption {
  key: string;
  label: string;
  fontFamily: string;
  fallbackFontFamily: string;
  cssStack: string;
}

export const EMAIL_FONTS: EmailFontOption[] = [
  {
    key: "system",
    label: "System sans",
    fontFamily: "-apple-system",
    fallbackFontFamily:
      "BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    cssStack:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  {
    key: "helvetica",
    label: "Helvetica / Arial",
    fontFamily: "Helvetica",
    fallbackFontFamily: "Arial, sans-serif",
    cssStack: "Helvetica, Arial, sans-serif",
  },
  {
    key: "georgia",
    label: "Georgia",
    fontFamily: "Georgia",
    fallbackFontFamily: "'Times New Roman', Times, serif",
    cssStack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    key: "mono",
    label: "Monospace",
    fontFamily: "'Courier New'",
    fallbackFontFamily: "Courier, monospace",
    cssStack: "'Courier New', Courier, monospace",
  },
];

export const DEFAULT_EMAIL_FONT_KEY = EMAIL_FONTS[0].key;

/** Resolve a font key to its option (falling back to the system stack). */
export function getEmailFontByKey(key: string | undefined): EmailFontOption {
  return EMAIL_FONTS.find((font) => font.key === key) ?? EMAIL_FONTS[0];
}

/** Resolve a document's font key (falling back to the system default). */
export function getMailyDocumentFontKey(document: MailyDocument): string {
  const key = document.fontKey;
  return typeof key === "string" && EMAIL_FONTS.some((font) => font.key === key)
    ? key
    : DEFAULT_EMAIL_FONT_KEY;
}

/** Per-template layout settings (the editor tracks these and merges them into
 *  the document snapshot so they persist through save/preview/send). */
export interface EmailLayout {
  maxWidth: number;
  paddingTop: number;
  paddingBottom: number;
  fontKey: string;
  containerBackground: string;
  bodyBackground: string;
}

/** Resolve a document's layout (clamped, with defaults). */
export function getMailyDocumentLayout(document: MailyDocument): EmailLayout {
  return {
    maxWidth: getMailyDocumentWidth(document),
    paddingTop: getMailyDocumentPaddingTop(document),
    paddingBottom: getMailyDocumentPaddingBottom(document),
    fontKey: getMailyDocumentFontKey(document),
    containerBackground: getMailyDocumentContainerBackground(document),
    bodyBackground: getMailyDocumentBodyBackground(document),
  };
}

/** Merge layout settings onto a document (for the editor snapshot). */
export function applyLayoutToDocument(
  document: MailyDocument,
  layout: EmailLayout,
): MailyDocument {
  return {
    ...document,
    maxWidth: layout.maxWidth,
    paddingTop: layout.paddingTop,
    paddingBottom: layout.paddingBottom,
    fontKey: layout.fontKey,
    containerBackground: layout.containerBackground,
    bodyBackground: layout.bodyBackground,
  };
}

export interface RenderedEmailBody {
  html: string;
  text: string;
}

export interface RenderedEmail extends RenderedEmailBody {
  subject: string;
}

// Build a render-theme `font` from a font option. `webFont: undefined` is
// required to strip the library's default Inter @font-face — the deep-merge in
// setTheme keeps the default webFont otherwise (which would download Inter).
function fontThemeForKey(fontKey: string) {
  const option = getEmailFontByKey(fontKey);
  return {
    fontFamily: option.fontFamily,
    fallbackFontFamily: option.fallbackFontFamily,
    webFont: undefined,
  };
}

// Default theme font is the system stack (renders identically in every client,
// no webfont download); a per-email choice overrides it at render time.
const SYSTEM_FONT = fontThemeForKey(DEFAULT_EMAIL_FONT_KEY);

const DEFAULT_EMAIL_RENDER_THEME = {
  font: SYSTEM_FONT,
  body: {
    backgroundColor: "#f3f4f6",
    paddingTop: "32px",
    // No horizontal gutter: on desktop the container is already centered at its
    // max-width (gray fills the sides), so side padding only matters on mobile —
    // where it would inset the card. Zeroing it lets the email fill the phone
    // width edge-to-edge while leaving the desktop framed look unchanged.
    paddingRight: "0px",
    paddingBottom: "32px",
    paddingLeft: "0px",
  },
  container: {
    backgroundColor: "#ffffff",
    maxWidth: "680px",
    minWidth: "300px",
    paddingTop: "32px",
    // No horizontal padding on the container itself — that lets `section` blocks
    // reach the card edges (full-width bands). Normal content keeps its gutter by
    // being wrapped in a padded section (see wrapLooseContentInSections).
    paddingRight: "0px",
    paddingBottom: "32px",
    paddingLeft: "0px",
    // The email card is always square — corner radius is not configurable
    // (rounded outer corners read oddly next to a square card-split band).
    borderRadius: "0px",
    borderWidth: "0px",
    borderColor: "transparent",
  },
};

// Horizontal gutter applied to "loose" (non-section) content so it stays inset
// from the card edges now that the container has no side padding.
export const CONTENT_GUTTER = 32;

// "Card split" band: a full-width section painted the same color as the backdrop
// the card sits on. It reads as a gap that divides the single email card into two
// stacked cards (an illusion — the email is still one container, which is the
// only client-safe shape). The marker rides on the section as a lowercase string
// attr (like `fullwidth`) so it survives Maily's attr handling; render repaints
// the band to the live backdrop and the editor does the same via CSS (see
// [data-card-gap] in globals.css), so the gap always matches the backdrop.
export const CARD_GAP_ATTR = "cardgap";

// Default band height (px). Tall enough to read as a separation; the admin can
// resize the inner spacer afterwards.
export const DEFAULT_CARD_GAP_HEIGHT = 24;

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

/** Quality (1–100) used for Supabase image transformations in emails. Lower than
 *  Supabase's default of 80 — these are display images, and smaller bytes (faster
 *  loads, less egress) matter more here than pixel-perfect fidelity. */
export const EMAIL_IMAGE_TRANSFORM_QUALITY = 72;

/** Supabase's hard ceiling for a transform width/height. */
const SUPABASE_MAX_TRANSFORM_DIMENSION = 2500;

/** This project's `…/storage/v1` base, or null when unconfigured (e.g. a unit
 *  test without env). Derived from NEXT_PUBLIC_SUPABASE_URL so the project ref is
 *  never hardcoded. */
function getSupabaseStorageBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  return `${url.replace(/\/+$/, "")}/storage/v1`;
}

/**
 * Rewrite a Supabase public-object image URL to the on-the-fly Image
 * Transformation endpoint (resized + recompressed), or return null when `src`
 * isn't a transformable Supabase object URL — external URLs (e.g. the
 * Vercel-served social icons), signed URLs, already-transformed URLs, and
 * non-raster formats are all left untouched.
 *
 * `format=origin` keeps the original format (JPEG/PNG) rather than letting
 * Supabase auto-negotiate WebP: Outlook desktop can't render WebP, so for email
 * we trade the WebP egress win for universal compatibility.
 */
export function supabaseImageTransformUrl(
  src: string,
  width: number,
): string | null {
  const base = getSupabaseStorageBaseUrl();
  if (!base) return null;
  const objectPrefix = `${base}/object/public/`;
  if (!src.startsWith(objectPrefix)) return null;
  const objectPath = src.slice(objectPrefix.length).split(/[?#]/)[0];
  // Only resize formats that are safe to: skip GIF (would flatten animation),
  // SVG/ICO (vector), and WebP (already optimized) — leave those as-is.
  if (!/\.(jpe?g|png)$/i.test(objectPath)) return null;
  const safeWidth = Math.min(
    Math.max(Math.round(width), 1),
    SUPABASE_MAX_TRANSFORM_DIMENSION,
  );
  return `${base}/render/image/public/${objectPath}?width=${safeWidth}&quality=${EMAIL_IMAGE_TRANSFORM_QUALITY}&format=origin`;
}

/**
 * Point every Supabase-hosted image at the transformation endpoint, sized to a
 * 2× (retina) version of its display width and capped at the email width. Images
 * hosted elsewhere are left untouched. Non-destructive (clones), so the stored
 * builder JSON and asset tracking — which key off the original public URLs — are
 * unaffected.
 */
function withTransformedImageSrcs(document: MailyDocument): MailyDocument {
  if (!getSupabaseStorageBaseUrl()) return document;
  const clone = cloneJson(document);
  const maxWidth = getMailyDocumentWidth(clone);

  function visit(node: JSONContent) {
    if (
      node.type === "image" &&
      isRecord(node.attrs) &&
      typeof node.attrs.src === "string"
    ) {
      const rawWidth =
        typeof node.attrs.width === "number"
          ? node.attrs.width
          : Number.parseInt(String(node.attrs.width), 10);
      const cssWidth = Number.isFinite(rawWidth)
        ? Math.min(rawWidth, maxWidth)
        : maxWidth;
      const transformed = supabaseImageTransformUrl(
        node.attrs.src,
        cssWidth * 2,
      );
      if (transformed) node.attrs.src = transformed;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  }

  visit(clone);
  return clone;
}

/** A transparent, borderless section with a horizontal gutter — wraps "loose"
 *  (non-section) content so it stays inset from the card edges. */
function paddedContentSection(content: JSONContent[]): JSONContent {
  return {
    type: "section",
    attrs: {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent",
      borderRadius: 0,
      align: "left",
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      paddingTop: 0,
      paddingRight: CONTENT_GUTTER,
      paddingBottom: 0,
      paddingLeft: CONTENT_GUTTER,
    },
    content,
  };
}

/**
 * Whether a top-level node renders edge-to-edge (full width) vs inset with a
 * gutter. An explicit `attrs.fullwidth` boolean wins; otherwise sections default
 * to full-width and everything else (text, images) defaults to inset. This flag
 * is what the admin's "Full width" toggle sets.
 */
export function isFullWidthNode(node: JSONContent): boolean {
  // Stored under a lowercase key with a string value (`fullwidth: "true"|"false"`)
  // so it can ride along on Maily's attr-spreading node views without tripping a
  // React DOM warning. Booleans are accepted too for resilience.
  const fullWidth = isRecord(node.attrs) ? node.attrs.fullwidth : undefined;
  if (fullWidth === true || fullWidth === "true") return true;
  if (fullWidth === false || fullWidth === "false") return false;
  return node.type === "section";
}

/** True for the transparent gutter wrappers `paddedContentSection` creates. */
function isGutterSection(node: JSONContent): boolean {
  if (node.type !== "section" || !isRecord(node.attrs)) return false;
  const attrs = node.attrs;
  return (
    attrs.backgroundColor === "transparent" &&
    attrs.borderWidth === 0 &&
    attrs.paddingLeft === CONTENT_GUTTER &&
    attrs.paddingRight === CONTENT_GUTTER
  );
}

/**
 * Editor layout: unwrap the gutter sections back to a flat list of blocks, so
 * the editor shows the real content and toggling full-width is a live CSS change
 * (no structural rewrite). Idempotent on an already-flat document.
 */
export function flattenEmailRows(document: MailyDocument): MailyDocument {
  const out: JSONContent[] = [];
  for (const node of document.content ?? []) {
    if (isRecord(node) && isGutterSection(node) && Array.isArray(node.content)) {
      out.push(...node.content);
    } else {
      out.push(node);
    }
  }
  return { ...document, content: out };
}

/**
 * Render layout: full-width nodes (sections by default, or anything flagged
 * `fullwidth: true`) become edge-to-edge rows; runs of inset nodes are wrapped in
 * a padded gutter section so they keep the 32px gutter (the container itself has
 * no side padding). Reliable across clients — nested 100% tables, no negative
 * margins. Flattens first so it's idempotent on already-arranged documents.
 */
export function arrangeEmailRows(document: MailyDocument): MailyDocument {
  const flat = flattenEmailRows(document);
  const out: JSONContent[] = [];
  let run: JSONContent[] = [];
  const flush = () => {
    if (run.length) {
      out.push(paddedContentSection(run));
      run = [];
    }
  };
  for (const node of flat.content ?? []) {
    if (isFullWidthNode(node)) {
      flush();
      out.push(node);
    } else {
      run.push(node);
    }
  }
  flush();
  return { ...document, content: out };
}

/** True for the full-width "card split" bands inserted via the editor's
 *  Card-split block. The marker is a lowercase string attr (booleans accepted
 *  for resilience), mirroring the `fullwidth` convention. */
export function isCardGapSection(node: JSONContent): boolean {
  if (node.type !== "section" || !isRecord(node.attrs)) return false;
  const flag = node.attrs[CARD_GAP_ATTR];
  return flag === "true" || flag === true;
}

/**
 * Build a "card split" band: a full-width section (sections default to
 * full-width, so it spans the card edge-to-edge) painted in `backgroundColor`,
 * with a spacer for its height. Bordered/padded to nothing so only the colored
 * band shows. This is the editor shape; at render `normalizeCardGapBands` repaints
 * it to the live backdrop and swaps the spacer for padding (see that function for
 * why). The `CARD_GAP_ATTR` marker is what both steps key off.
 */
export function createCardGapSection(
  backgroundColor: string,
  height: number = DEFAULT_CARD_GAP_HEIGHT,
): JSONContent {
  return {
    type: "section",
    attrs: {
      backgroundColor,
      borderWidth: 0,
      borderColor: "transparent",
      borderRadius: 0,
      align: "left",
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      // Sections are full-width by default; set it explicitly so the band reaches
      // the card edges even if a future default changes.
      fullwidth: "true",
      [CARD_GAP_ATTR]: "true",
    },
    content: [{ type: "spacer", attrs: { height } }],
  };
}

/** The band height (px) the editor shows for a card-split section: the sum of
 *  its inner spacer heights, falling back to the default. */
function cardGapBandHeight(section: JSONContent): number {
  let total = 0;
  for (const child of section.content ?? []) {
    if (child?.type === "spacer" && isRecord(child.attrs)) {
      const height = Number(child.attrs.height);
      if (Number.isFinite(height) && height > 0) total += height;
    }
  }
  return total > 0 ? total : DEFAULT_CARD_GAP_HEIGHT;
}

/**
 * Render-only normalization of card-split bands. The editor stores each band as a
 * full-width section with an inner spacer for its height — but @maily-to/render
 * caps that spacer at its ~600px body width, so on clients that let the card grow
 * past 600px (or shrink the cell to its content) the band stops short of the card
 * edges and the two "cards" stay joined. So at render we:
 *  1. repaint the band to `color` (the backdrop), so the split illusion holds even
 *     after the admin changes the backdrop; and
 *  2. drop the width-capped inner spacer, carrying the height on symmetric
 *     vertical padding instead — leaving a bare, full-width colored cell that
 *     reaches the card edges in every client.
 * Non-destructive (clones).
 */
export function normalizeCardGapBands(
  document: MailyDocument,
  color: string,
): MailyDocument {
  const clone = cloneJson(document);

  function visit(node: JSONContent) {
    if (isCardGapSection(node) && isRecord(node.attrs)) {
      const height = cardGapBandHeight(node);
      node.attrs.backgroundColor = color;
      node.attrs.paddingTop = Math.ceil(height / 2);
      node.attrs.paddingBottom = Math.floor(height / 2);
      node.attrs.paddingLeft = 0;
      node.attrs.paddingRight = 0;
      node.content = [];
      return;
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

// Injected into <head>: reset the default ~8px <body> margin Maily leaves in
// place, so the email is not inset on narrow screens. The card is always square
// (corner radius is fixed at 0), so no corner handling is needed.
function buildBaseEmailCss(): string {
  return ["<style>", "body{margin:0 !important;padding:0 !important;}", "</style>"].join(
    "",
  );
}

function injectBaseEmailCss(html: string): string {
  const css = buildBaseEmailCss();
  const headClose = html.toLowerCase().indexOf("</head>");
  if (headClose === -1) return `${css}${html}`;
  return `${html.slice(0, headClose)}${css}${html.slice(headClose)}`;
}

/**
 * Drop zero-width borders from inline styles. @maily-to/render emits
 * `border-style:solid;border-width:0;border-color:transparent` on the container
 * and section cells. The Word engine behind Outlook (Windows) doesn't understand
 * `transparent` and paints those as **black** lines. A 0-width border is never
 * meant to be visible, so we strip its border-* declarations entirely (keeping
 * `border-radius`). Real borders (width > 0, e.g. the `<hr>` rules) are untouched.
 * Safe for every client — a 0-width border renders nothing anywhere.
 */
function stripZeroWidthBorders(html: string): string {
  return html.replace(/style="([^"]*)"/g, (whole, style: string) => {
    if (!/border-width:0(px)?(;|$)/.test(style)) return whole;
    const cleaned = style
      .split(";")
      .map((decl) => decl.trim())
      .filter(Boolean)
      .filter((decl) => !/^border-(width|style|color)\s*:/i.test(decl))
      .join(";");
    return `style="${cleaned}"`;
  });
}

/** Index just past the `</table>` that closes the `<table` opening at `openIdx`,
 *  accounting for nested tables; -1 if the markup is unbalanced. */
function findMatchingTableCloseEnd(html: string, openIdx: number): number {
  const tagRe = /<table\b|<\/table>/gi;
  tagRe.lastIndex = openIdx;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    if (match[0][1] === "/") {
      depth -= 1;
      if (depth === 0) return match.index + match[0].length;
    } else {
      depth += 1;
    }
  }
  return -1;
}

/**
 * Outlook (Windows, the Word engine) clips the content of any single table cell
 * taller than ~1790px (23.7"), rendering the overflow as blank space — content
 * silently gone, no "show more". @maily-to/render nests the WHOLE email in one
 * container cell, so a long newsletter is cut off in Outlook (only — every other
 * client renders the full height). It also ignores `max-width`, so the container
 * blows out to the reading-pane width.
 *
 * The constants below drive the two Outlook-only fixes (`wrapAndSplitContainerForOutlook`):
 *  - the ghost table pins the container width, and
 *  - the container cell is split into a stack of sub-`SEGMENT` tables so no single
 *    cell ever reaches the `CELL` ceiling.
 */
const OUTLOOK_MAX_CELL_PX = 1790; // Word's hard per-cell height ceiling
const OUTLOOK_MAX_SEGMENT_PX = 1400; // target per-segment height (margin under the ceiling)

/** Close tags for one @maily-to/render cell (`<table><tbody><tr><td>…`). */
const OUTLOOK_CELL_CLOSE = "</td></tr></tbody></table>";

/** The MSO ghost-table wrapper (no <tbody>, matching the long-standing markup the
 *  width fix shipped with). Opens immediately before the real container. */
function outlookGhostOpen(width: number): string {
  return (
    `<table role="presentation" align="center" border="0" ` +
    `cellpadding="0" cellspacing="0" width="${width}"><tr>` +
    `<td width="${width}" style="width:${width}px">`
  );
}
const OUTLOOK_GHOST_CLOSE = "</td></tr></table>";

/** Zero a cell's vertical padding in a captured open-tag string, so a *reopened*
 *  segment doesn't repeat the container/section top+bottom padding at every seam
 *  (the inter-block spacing lives on block margins, which are preserved). */
function zeroVerticalPadding(openTags: string): string {
  return openTags
    .replace(/padding-top:\s*\d+px/gi, "padding-top:0")
    .replace(/padding-bottom:\s*\d+px/gi, "padding-bottom:0");
}

/**
 * Estimate a rendered block's height in px. Rough by design and biased to
 * OVER-estimate: a high guess only splits more eagerly (extra, harmless seams in
 * Outlook), while a low guess risks leaving a segment over the cell ceiling.
 * Images render with `height:auto`, so their height is unknown — we assume up to a
 * 3:2 portrait of the display width.
 */
function estimateBlockHeightPx(blockHtml: string, maxWidth: number): number {
  // Hidden wrappers (the preview-text node) occupy no visible height.
  if (/display:\s*none|max-height:\s*0(px)?\b/i.test(blockHtml)) return 0;
  let height = 0;
  const imgRe = /<img\b[^>]*>/gi;
  let img: RegExpExecArray | null;
  while ((img = imgRe.exec(blockHtml))) {
    const w =
      Number(img[0].match(/width:\s*(\d+)px/i)?.[1]) ||
      Number(img[0].match(/\bwidth="(\d+)"/i)?.[1]) ||
      maxWidth;
    height += Math.min(w, maxWidth) * 1.5;
  }
  // Explicit heights (spacers, card-split bands) — img heights are `auto`, so this
  // never double-counts them.
  const explicit = [...blockHtml.matchAll(/height:\s*(\d+)px/gi)].map((m) =>
    Number(m[1]),
  );
  if (explicit.length) height += Math.max(...explicit);
  // Text: a rough line count at the column width.
  const text = blockHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text) {
    const isHeading = /<h[1-6]\b/i.test(blockHtml);
    const perLine = Math.max(16, Math.floor(maxWidth / (isHeading ? 16 : 8)));
    height += Math.ceil(text.length / perLine) * (isHeading ? 42 : 28);
  }
  return Math.max(height + 24, 36); // every block occupies some space
}

/** Parse a table's first cell: the open-tag prefix (`<table…><tbody><tr><td…>`),
 *  the inner content range, and whether it's a single column (vs a `columns` row,
 *  which must not be split). Returns null if no parseable first cell. */
function parseFirstCell(
  html: string,
  tableStart: number,
  tableEnd: number,
): {
  openTags: string;
  innerStart: number;
  innerEnd: number;
  singleColumn: boolean;
} | null {
  const tdOpen = html.indexOf("<td", tableStart);
  if (tdOpen === -1 || tdOpen >= tableEnd) return null;
  const tdGt = html.indexOf(">", tdOpen);
  if (tdGt === -1 || tdGt >= tableEnd) return null;
  const innerStart = tdGt + 1;
  const re = /<td\b|<\/td>/gi;
  re.lastIndex = innerStart;
  let depth = 1;
  let innerEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && m.index < tableEnd) {
    if (m[0][1] === "/") {
      depth -= 1;
      if (depth === 0) {
        innerEnd = m.index;
        break;
      }
    } else depth += 1;
  }
  if (innerEnd === -1) return null;
  // Single column ⇔ the next significant tag after this cell closes is </tr>
  // (a `columns` row has a sibling <td> instead).
  const singleColumn = /^\s*<\/tr/i.test(html.slice(innerEnd + 5, tableEnd));
  return {
    openTags: html.slice(tableStart, innerStart),
    innerStart,
    innerEnd,
    singleColumn,
  };
}

/** HTML void elements (no closing tag) — a block-level child is "done" the moment
 *  its tag closes. @maily-to/render emits images/rules self-closed, but match the
 *  bare forms too for resilience. */
const VOID_ELEMENTS = /^(img|hr|br|input|source|area|base|col|embed|wbr)$/i;

/** Index just past the `</tag>` that closes the `<tag …>` opened at `from-1`,
 *  accounting for same-tag nesting; -1 if unbalanced or past `limit`. */
function findMatchingElementClose(
  html: string,
  tag: string,
  from: number,
  limit: number,
): number {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && m.index < limit) {
    if (m[0][1] === "/") {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else depth += 1;
  }
  return -1;
}

/** The tag name of the element starting at `start` (`"table"`, `"h2"`, `"img"`…),
 *  or null if `start` isn't an element open. */
function childTagName(html: string, start: number): string | null {
  return /^<([a-zA-Z][a-zA-Z0-9]*)\b/.exec(html.slice(start, start + 24))?.[1] ?? null;
}

/** Enumerate the top-level child ELEMENTS of a cell (skipping whitespace, text,
 *  and comments). Section cells hold raw block elements (`<h2>`, `<p>`, `<img>`,
 *  `<hr>`, `<a>`) — not just tables — so the walker is element-generic. */
function enumerateCellChildren(
  html: string,
  start: number,
  end: number,
): { start: number; end: number }[] {
  const children: { start: number; end: number }[] = [];
  let pos = start;
  while (pos < end) {
    while (pos < end && /\s/.test(html[pos])) pos += 1;
    if (pos >= end) break;
    if (html.startsWith("<!--", pos)) {
      const close = html.indexOf("-->", pos);
      pos = close === -1 ? end : close + 3;
      continue;
    }
    if (html[pos] !== "<") {
      const next = html.indexOf("<", pos);
      pos = next === -1 || next >= end ? end : next;
      continue;
    }
    const tag = childTagName(html, pos);
    if (!tag) break;
    const gt = html.indexOf(">", pos);
    if (gt === -1 || gt >= end) break;
    const selfClosed = html[gt - 1] === "/" || VOID_ELEMENTS.test(tag);
    const childEnd = selfClosed
      ? gt + 1
      : findMatchingElementClose(html, tag, gt + 1, end);
    if (childEnd === -1) break;
    children.push({ start: pos, end: childEnd });
    pos = childEnd;
  }
  return children;
}

/** One open table/ghost level in the nesting chain: how to close it (innermost
 *  first) and reopen it (outermost first) when splitting at a break. */
interface OutlookFrame {
  open: string;
  close: string;
}

interface OutlookBreakState {
  cum: number;
  insertions: { pos: number; text: string }[];
}

function cellFrame(openTags: string): OutlookFrame {
  return { open: zeroVerticalPadding(openTags), close: OUTLOOK_CELL_CLOSE };
}
function ghostFrame(width: number): OutlookFrame {
  return { open: outlookGhostOpen(width), close: OUTLOOK_GHOST_CLOSE };
}

/**
 * Walk the block elements inside a cell and record, in `state.insertions`, the
 * positions where an MSO-conditional break should be spliced in to keep each
 * Outlook segment under `OUTLOOK_MAX_SEGMENT_PX`. `stack` is the chain of
 * currently-open levels (body cell → width ghost → container cell → section cell →
 * …); a break closes them all (innermost first) and reopens them (outermost
 * first), so Outlook sees a fresh short stack of tables at every level — no single
 * cell reaches the ceiling. Oversized single-column sections (and the container
 * itself, which also gets the width ghost) are descended into so their children
 * break too. `state.cum` (running height) is global across the descent, so a
 * section's first chunk shares the budget with whatever preceded it.
 */
function planOutlookBreaks(
  html: string,
  innerStart: number,
  innerEnd: number,
  stack: OutlookFrame[],
  width: number,
  state: OutlookBreakState,
): void {
  const buildBreak = () =>
    `<!--[if mso]>${stack
      .slice()
      .reverse()
      .map((f) => f.close)
      .join("")}${stack.map((f) => f.open).join("")}<![endif]-->`;

  for (const child of enumerateCellChildren(html, innerStart, innerEnd)) {
    const childHeight = estimateBlockHeightPx(
      html.slice(child.start, child.end),
      width,
    );

    // A child worth descending into is itself a single-column section/wrapper
    // table holding multiple blocks (so its cell can be split too). The container
    // (the max-width table) additionally carries the width ghost.
    let descendCell: ReturnType<typeof parseFirstCell> = null;
    let descendFrames: OutlookFrame[] = [];
    if (childTagName(html, child.start) === "table") {
      const cell = parseFirstCell(html, child.start, child.end);
      // Descend into any single-column wrapper/section with content (container →
      // section → …). Short leaf tables (buttons, columns, image wrappers) are
      // already excluded by the `childHeight > SEGMENT` guard below; a lone tall
      // child (e.g. a single big section) must still be drilled into to reach its
      // own splittable children — so one child is enough.
      if (
        cell &&
        cell.singleColumn &&
        enumerateCellChildren(html, cell.innerStart, cell.innerEnd).length >= 1
      ) {
        descendCell = cell;
        const isContainer = html
          .slice(child.start, cell.innerStart)
          .includes(`max-width:${width}px`);
        descendFrames = isContainer
          ? [ghostFrame(width), cellFrame(cell.openTags)]
          : [cellFrame(cell.openTags)];
      }
    }

    if (descendCell && childHeight > OUTLOOK_MAX_SEGMENT_PX) {
      // Descend rather than break before it: the carried `cum` is handled by the
      // first break *inside* the child, so no redundant pre-break here.
      stack.push(...descendFrames);
      planOutlookBreaks(
        html,
        descendCell.innerStart,
        descendCell.innerEnd,
        stack,
        width,
        state,
      );
      stack.length -= descendFrames.length;
    } else {
      // Break before this block when the running segment would overflow (never on
      // an empty segment — that would emit a useless empty table).
      if (state.cum > 0 && state.cum + childHeight > OUTLOOK_MAX_SEGMENT_PX) {
        state.insertions.push({ pos: child.start, text: buildBreak() });
        state.cum = 0;
      }
      if (childHeight > OUTLOOK_MAX_CELL_PX) {
        // Disclosed degradation: a single indivisible block past the ceiling will
        // still clip in Outlook (nothing can split one image/paragraph).
        console.warn(
          `[email] A single block (~${Math.round(childHeight)}px) exceeds ` +
            `Outlook's ${OUTLOOK_MAX_CELL_PX}px cell limit and may be clipped in Outlook.`,
        );
      }
      state.cum += childHeight;
    }
  }
}

interface SplitLocation {
  containerStart: number;
  containerEnd: number;
  rootStart: number;
  rootEnd: number;
  rootCell: NonNullable<ReturnType<typeof parseFirstCell>>;
  rootIsContainer: boolean;
}

/** Locate the container (the max-width table) and the split root — the outermost
 *  table wrapping it (the body background table), or the container itself if none
 *  is found. Re-run after any edit, since indices shift. */
function locateSplitRoot(html: string, width: number): SplitLocation | null {
  const markerIdx = html.indexOf(`max-width:${width}px`);
  if (markerIdx === -1) return null;
  const containerStart = html.lastIndexOf("<table", markerIdx);
  if (containerStart === -1) return null;
  const containerEnd = findMatchingTableCloseEnd(html, containerStart);
  if (containerEnd === -1) return null;

  let rootStart = containerStart;
  let rootEnd = containerEnd;
  const bodyIdx = html.indexOf("<body");
  if (bodyIdx !== -1) {
    const bodyTableStart = html.indexOf("<table", bodyIdx);
    if (bodyTableStart !== -1 && bodyTableStart < containerStart) {
      const bodyTableEnd = findMatchingTableCloseEnd(html, bodyTableStart);
      if (bodyTableEnd >= containerEnd) {
        rootStart = bodyTableStart;
        rootEnd = bodyTableEnd;
      }
    }
  }
  const rootCell = parseFirstCell(html, rootStart, rootEnd);
  if (!rootCell) return null;
  return {
    containerStart,
    containerEnd,
    rootStart,
    rootEnd,
    rootCell,
    rootIsContainer: rootStart === containerStart,
  };
}

// When the root IS the container (fallback), the width ghost belongs in the
// initial stack; otherwise the container's ghost is pushed during descent.
function buildInitialStack(loc: SplitLocation, width: number): OutlookFrame[] {
  return loc.rootIsContainer
    ? [ghostFrame(width), cellFrame(loc.rootCell.openTags)]
    : [cellFrame(loc.rootCell.openTags)];
}

/** A transparent, full-width vertical spacer (inherits the parent background).
 *  `data-seam` marks it as the relocated bottom padding. */
function seamSpacer(height: number): string {
  return (
    `<table role="presentation" data-seam="1" width="100%" border="0" ` +
    `cellpadding="0" cellspacing="0"><tbody><tr><td height="${height}" ` +
    `style="height:${height}px;line-height:${height}px;font-size:1px;` +
    `mso-line-height-rule:exactly">&#8202;</td></tr></tbody></table>`
  );
}

const zeroPaddingBottom = (s: string) =>
  s.replace(/padding-bottom:\s*\d+px/gi, "padding-bottom:0");

/**
 * Tighten the seams that splitting would otherwise create. Without this, the
 * first segment reuses the container's and body's real open tags, so their
 * bottom padding (32px white + 32px gray) lands at the FIRST cut instead of the
 * email's bottom — a visible gray band in Outlook. We move that bottom padding
 * into a trailing spacer at the true bottom of each cell: padding-bottom→0 (so
 * the first seam is flush, like every other) and an equal-height spacer as the
 * cell's last child (so the email's bottom spacing is preserved for every
 * client). Real-markup change, but visually identical everywhere — only applied
 * when a split actually happens. Top padding is untouched (it's the email top).
 */
function neutralizeSeamPadding(html: string, width: number): string {
  const loc = locateSplitRoot(html, width);
  if (!loc) return html;
  const containerCell = parseFirstCell(html, loc.containerStart, loc.containerEnd);
  if (!containerCell) return html;
  const bodyCell = loc.rootIsContainer ? null : loc.rootCell;

  const cpb = Number(
    containerCell.openTags.match(/padding-bottom:\s*(\d+)px/i)?.[1] ?? 0,
  );
  const bpb = bodyCell
    ? Number(bodyCell.openTags.match(/padding-bottom:\s*(\d+)px/i)?.[1] ?? 0)
    : 0;

  // Disjoint edits, applied right-to-left so smaller indices stay valid.
  const edits: { start: number; end: number; text: string }[] = [];
  if (bodyCell && bpb > 0)
    edits.push({ start: bodyCell.innerEnd, end: bodyCell.innerEnd, text: seamSpacer(bpb) });
  if (cpb > 0)
    edits.push({
      start: containerCell.innerEnd,
      end: containerCell.innerEnd,
      text: seamSpacer(cpb),
    });
  if (cpb > 0)
    edits.push({
      start: loc.containerStart,
      end: containerCell.innerStart,
      text: zeroPaddingBottom(html.slice(loc.containerStart, containerCell.innerStart)),
    });
  if (bodyCell && bpb > 0)
    edits.push({
      start: loc.rootStart,
      end: bodyCell.innerStart,
      text: zeroPaddingBottom(html.slice(loc.rootStart, bodyCell.innerStart)),
    });

  edits.sort((a, b) => b.start - a.start);
  let out = html;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/**
 * Apply both Outlook (Word-engine) container fixes by splicing MSO-conditional
 * comments into the rendered HTML — invisible to every other client, which see
 * the original markup untouched (zero regression):
 *  1. wrap the container in a width-pinned ghost table (fixes `max-width` blowout);
 *  2. split into a stack of tables each under the cell-height ceiling (fixes the
 *     long-email clip).
 *
 * The split is rooted at the OUTERMOST table that wraps the container (the body
 * background table): its single cell wraps the whole email too, so Outlook would
 * clip there regardless of the inner container split. The walk descends body cell
 * → container cell → section cell, breaking wherever the running height would
 * exceed the segment target. When a split is needed, seams are first tightened so
 * the result reads as one continuous card (see `neutralizeSeamPadding`).
 */
function wrapAndSplitContainerForOutlook(html: string, width: number): string {
  let loc = locateSplitRoot(html, width);
  if (!loc) return html;

  // Probe: will this email actually be split? Short emails keep the original
  // markup entirely (only the outer width ghost is added below).
  const probe: OutlookBreakState = { cum: 0, insertions: [] };
  planOutlookBreaks(
    html,
    loc.rootCell.innerStart,
    loc.rootCell.innerEnd,
    buildInitialStack(loc, width),
    width,
    probe,
  );

  if (probe.insertions.length > 0) {
    html = neutralizeSeamPadding(html, width);
    loc = locateSplitRoot(html, width);
    if (!loc) return html;
  }

  const state: OutlookBreakState = { cum: 0, insertions: [] };
  planOutlookBreaks(
    html,
    loc.rootCell.innerStart,
    loc.rootCell.innerEnd,
    buildInitialStack(loc, width),
    width,
    state,
  );

  const insertions = [
    {
      pos: loc.containerStart,
      text: `<!--[if mso]>${outlookGhostOpen(width)}<![endif]-->`,
    },
    ...state.insertions,
    {
      pos: loc.containerEnd,
      text: `<!--[if mso]>${OUTLOOK_GHOST_CLOSE}<![endif]-->`,
    },
  ].sort((a, b) => a.pos - b.pos);

  let out = "";
  let last = 0;
  for (const ins of insertions) {
    out += html.slice(last, ins.pos) + ins.text;
    last = ins.pos;
  }
  return out + html.slice(last);
}

/** Apply the Outlook-compatibility fixes to a rendered HTML string: strip the
 *  transparent zero-width borders Word renders black, keep the social row inline,
 *  then pin + split the container so long emails aren't clipped at Outlook's
 *  cell-height ceiling. `keepSocialRowInline` runs first so it operates on clean
 *  markup, before the split injects MSO comments containing table tags. */
function applyOutlookFixes(html: string, width: number): string {
  return wrapAndSplitContainerForOutlook(
    keepSocialRowInline(stripZeroWidthBorders(html)),
    width,
  );
}

/** Public path the brand social icons are served from (the admin app and public
 *  site share an origin, so this segment is stable in dev and prod). Used to
 *  recognize a social-icon row in the rendered HTML. */
const SOCIAL_ICON_PATH = "/email/social/";

/**
 * Keep a social-icon row on one line on mobile. @maily-to/render makes every
 * `columns` block stack on phones via
 * `@media (max-width:425px){.tab-col-full{display:block!important;width:100%!important}}`
 * — right for content columns, but it turns a row of social icons into a
 * vertical stack. For any columns table that holds the social icons (images
 * served from SOCIAL_ICON_PATH), strip the responsive `tab-*` classes so it opts
 * out of stacking and stays inline (the icons just shrink to fit). Content
 * columns elsewhere keep stacking.
 */
export function keepSocialRowInline(html: string): string {
  const marker = 'class="tab-row-full"';
  let out = "";
  let from = 0;
  for (;;) {
    const classIdx = html.indexOf(marker, from);
    if (classIdx === -1) {
      out += html.slice(from);
      break;
    }
    const openIdx = html.lastIndexOf("<table", classIdx);
    const closeIdx =
      openIdx === -1 ? -1 : findMatchingTableCloseEnd(html, openIdx);
    if (openIdx === -1 || closeIdx === -1) {
      // Couldn't bound this table — leave it untouched and step past the marker.
      out += html.slice(from, classIdx + marker.length);
      from = classIdx + marker.length;
      continue;
    }
    out += html.slice(from, openIdx);
    const table = html.slice(openIdx, closeIdx);
    out += table.includes(SOCIAL_ICON_PATH)
      ? table.replace(/\s*class="(?:tab-row-full|tab-col-full|tab-pad)"/g, "")
      : table;
    from = closeIdx;
  }
  return out;
}

export async function renderMailyDocument(
  document: MailyDocument,
  input: {
    previewText?: string;
    variables?: EmailRenderVariables;
  } = {},
): Promise<RenderedEmailBody> {
  const arranged = arrangeEmailRows(
    withTransformedImageSrcs(
      withResponsiveImages(assertMailyDocument(document)),
    ),
  );
  // One backdrop value drives both the body background and the card-split bands,
  // so the gap is always exactly the backdrop color (the split illusion holds).
  const bodyBackground = getMailyDocumentBodyBackground(arranged);
  const normalized = normalizeCardGapBands(arranged, bodyBackground);
  const width = getMailyDocumentWidth(normalized);
  const renderer = new Maily(normalized);
  renderer.setTheme({
    ...DEFAULT_EMAIL_RENDER_THEME,
    font: fontThemeForKey(getMailyDocumentFontKey(normalized)),
    body: {
      ...DEFAULT_EMAIL_RENDER_THEME.body,
      backgroundColor: bodyBackground,
    },
    container: {
      ...DEFAULT_EMAIL_RENDER_THEME.container,
      maxWidth: `${getMailyDocumentWidth(normalized)}px`,
      paddingTop: `${getMailyDocumentPaddingTop(normalized)}px`,
      paddingBottom: `${getMailyDocumentPaddingBottom(normalized)}px`,
      backgroundColor: getMailyDocumentContainerBackground(normalized),
    },
  });
  if (input.previewText) {
    renderer.setPreviewText(input.previewText);
  }
  if (input.variables) {
    renderer.setVariableValues(flattenEmailVariables(input.variables));
  }

  const [rawHtml, text] = await Promise.all([
    renderer.render({ pretty: true }),
    renderer.render({ plainText: true }),
  ]);
  return {
    html: injectBaseEmailCss(applyOutlookFixes(rawHtml, width)),
    text,
  };
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
