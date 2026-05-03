import { Maily, type JSONContent } from "@maily-to/render";
import {
  flattenEmailVariables,
  interpolateEmailVariables,
  type EmailRenderVariables,
} from "./variables";

export type MailyDocument = JSONContent & {
  type: "doc";
  content: JSONContent[];
};

export interface RenderedEmailBody {
  html: string;
  text: string;
}

export interface RenderedEmail extends RenderedEmailBody {
  subject: string;
}

const DEFAULT_EMAIL_RENDER_THEME = {
  body: {
    backgroundColor: "#f3f4f6",
    paddingTop: "32px",
    paddingRight: "16px",
    paddingBottom: "32px",
    paddingLeft: "16px",
  },
  container: {
    backgroundColor: "#ffffff",
    maxWidth: "640px",
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
  const renderer = new Maily(assertMailyDocument(document));
  renderer.setTheme(DEFAULT_EMAIL_RENDER_THEME);
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
