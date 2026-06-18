import { describe, expect, it } from "vitest";
import {
  assertMailyDocument,
  clampEmailWidth,
  createDefaultMailyDocument,
  DEFAULT_EMAIL_WIDTH,
  getAssetIdsForMailyDocument,
  getMailyDocumentWidth,
  MAX_EMAIL_WIDTH,
  MIN_EMAIL_WIDTH,
  renderMailyDocument,
  renderMailyEmail,
} from "./maily";

describe("Maily rendering", () => {
  it("creates a default Maily document for new templates", () => {
    const document = createDefaultMailyDocument();

    expect(document.type).toBe("doc");
    // Content flows directly inside the padded container (no full-width section).
    expect(document.content?.some((node) => node.type === "heading")).toBe(true);
    expect(JSON.stringify(document)).toContain("contact.name");
  });

  it("places a banner image above the body content", () => {
    const document = createDefaultMailyDocument({
      imageUrl: "https://cdn.example.com/banner.png",
    });

    expect(document.content?.[0]?.type).toBe("image");
    expect(document.content?.[1]?.type).toBe("heading");
  });

  it("renders the email at the default 680px width with a padded container", async () => {
    const rendered = await renderMailyDocument(createDefaultMailyDocument());

    expect(rendered.html).toContain("max-width:680px");
    // Container keeps horizontal padding so content is not full-bleed.
    expect(rendered.html).toContain("padding-left:32px");
  });

  it("clamps a custom email width to the allowed range", () => {
    expect(clampEmailWidth(720)).toBe(720);
    expect(clampEmailWidth(100)).toBe(MIN_EMAIL_WIDTH);
    expect(clampEmailWidth(5000)).toBe(MAX_EMAIL_WIDTH);
    expect(clampEmailWidth("not a number")).toBe(DEFAULT_EMAIL_WIDTH);
    expect(clampEmailWidth("740px")).toBe(740);
  });

  it("resolves a document's width, defaulting and clamping as needed", () => {
    expect(getMailyDocumentWidth(createDefaultMailyDocument())).toBe(
      DEFAULT_EMAIL_WIDTH,
    );
    expect(
      getMailyDocumentWidth({ type: "doc", content: [], maxWidth: 600 }),
    ).toBe(600);
    expect(
      getMailyDocumentWidth({ type: "doc", content: [], maxWidth: 99999 }),
    ).toBe(MAX_EMAIL_WIDTH);
  });

  it("renders at a custom per-document width when set", async () => {
    const document = { ...createDefaultMailyDocument(), maxWidth: 720 };
    const rendered = await renderMailyDocument(document);

    expect(rendered.html).toContain("max-width:720px");
    expect(rendered.html).not.toContain("max-width:680px");
  });

  it("resets the body margin so the email is not inset on mobile", async () => {
    const rendered = await renderMailyDocument(createDefaultMailyDocument());

    expect(rendered.html).toContain("body{margin:0 !important");
  });

  it("uses a system font stack and loads no web font", async () => {
    const rendered = await renderMailyDocument(createDefaultMailyDocument());

    expect(rendered.html).toContain("-apple-system");
    // The library default Inter web font must not be downloaded.
    expect(rendered.html).not.toContain("rsms.me");
  });

  it("forces images to height:auto so they scale proportionally on mobile", async () => {
    const rendered = await renderMailyDocument(
      assertMailyDocument({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "https://cdn.example.com/banner.png",
              width: "600",
              // A fixed pixel height (as the editor stores after a drag-resize)
              // must be normalized away at render time.
              height: "200",
            },
          },
        ],
      }),
    );

    expect(rendered.html).toContain("height:auto");
    expect(rendered.html).not.toContain("height:200px");
  });

  it("renders Maily JSON to HTML and text without consuming variables", async () => {
    const rendered = await renderMailyDocument(createDefaultMailyDocument());

    expect(rendered.html).toContain("<html");
    expect(rendered.html).toContain("{{contact.name");
    expect(rendered.text.toLowerCase()).toContain("{{contact.name");
  });

  it("renders emails inside a white container on a colored background", async () => {
    const rendered = await renderMailyDocument(createDefaultMailyDocument());

    expect(rendered.html).toContain("background-color:#f3f4f6");
    expect(rendered.html).toContain("background-color:#ffffff");
    expect(rendered.html).toContain("border-radius:12px");
  });

  it("renders subject and body with per-recipient variables", async () => {
    const rendered = await renderMailyEmail({
      subject: "Hello {{contact.name}}",
      previewText: "A note for {{contact.name}}",
      document: createDefaultMailyDocument(),
      variables: {
        contact: {
          id: "contact-1",
          name: "Maya",
          email: "maya@example.com",
        },
      },
    });

    expect(rendered.subject).toBe("Hello Maya");
    expect(rendered.html).toContain("Maya");
    expect(rendered.text.toLowerCase()).toContain("maya");
    expect(rendered.text).not.toContain("{{contact.name");
  });

  it("rejects invalid Maily JSON instead of silently replacing it", () => {
    expect(() => assertMailyDocument({ type: "paragraph" })).toThrow(
      "Invalid Maily document",
    );
    expect(() => assertMailyDocument({ type: "doc", content: "bad" })).toThrow(
      "Invalid Maily document",
    );
  });

  it("extracts referenced asset ids from nested image nodes", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "section",
          content: [
            {
              type: "image",
              attrs: {
                src: "https://cdn.example.com/header.png",
                assetId: "550e8400-e29b-41d4-a716-446655440001",
              },
            },
          ],
        },
      ],
    };

    expect(getAssetIdsForMailyDocument(assertMailyDocument(document))).toEqual([
      "550e8400-e29b-41d4-a716-446655440001",
    ]);
  });

  it("extracts referenced asset public URLs from uploaded image nodes", async () => {
    const { getAssetPublicUrlsForMailyDocument } = await import("./maily");
    const document = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://cdn.example.com/email-assets/header.png",
          },
        },
        {
          type: "image",
          attrs: {
            src: "",
          },
        },
      ],
    };

    expect(
      getAssetPublicUrlsForMailyDocument(assertMailyDocument(document)),
    ).toEqual(["https://cdn.example.com/email-assets/header.png"]);
  });
});
