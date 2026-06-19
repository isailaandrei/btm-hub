import { describe, expect, it } from "vitest";
import {
  applyLayoutToDocument,
  assertMailyDocument,
  clampCornerRadius,
  clampEmailWidth,
  createDefaultMailyDocument,
  DEFAULT_BODY_BACKGROUND,
  DEFAULT_CONTAINER_BACKGROUND,
  DEFAULT_CORNER_RADIUS,
  DEFAULT_EMAIL_FONT_KEY,
  DEFAULT_EMAIL_WIDTH,
  getAssetIdsForMailyDocument,
  getMailyDocumentFontKey,
  getMailyDocumentLayout,
  getMailyDocumentWidth,
  MAX_CORNER_RADIUS,
  MAX_EMAIL_WIDTH,
  MIN_EMAIL_WIDTH,
  normalizeHexColor,
  renderMailyDocument,
  renderMailyEmail,
  arrangeEmailRows,
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

  it("renders with custom container vertical padding (e.g. flush-top banner)", async () => {
    const document = {
      ...createDefaultMailyDocument(),
      paddingTop: 0,
      paddingBottom: 48,
    };
    const rendered = await renderMailyDocument(document);

    expect(rendered.html).toContain("padding-top:0px");
    expect(rendered.html).toContain("padding-bottom:48px");
  });

  it("renders at a custom per-document width when set", async () => {
    const document = { ...createDefaultMailyDocument(), maxWidth: 720 };
    const rendered = await renderMailyDocument(document);

    expect(rendered.html).toContain("max-width:720px");
    expect(rendered.html).not.toContain("max-width:680px");
  });

  it("lays out rows: sections full-width, loose content guttered", () => {
    const banner = { type: "section", attrs: {}, content: [] };
    const doc = assertMailyDocument({
      type: "doc",
      content: [
        banner,
        { type: "heading", content: [{ type: "text", text: "Hi" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    });

    const arranged = arrangeEmailRows(doc);

    // banner section stays full-width (a row); the heading + paragraph get
    // grouped into one padded gutter section.
    expect(arranged.content.map((n) => n.type)).toEqual(["section", "section"]);
    expect(arranged.content[0]).toEqual(banner);
    expect(arranged.content[1]?.attrs?.paddingLeft).toBe(32);
    expect(arranged.content[1]?.content?.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
    ]);
  });

  it("honors the fullWidth flag: full-width image, inset section", () => {
    const doc = assertMailyDocument({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "x", fullwidth: true } },
        { type: "section", attrs: { fullwidth: false }, content: [] },
      ],
    });

    const arranged = arrangeEmailRows(doc);

    // flagged image becomes a top-level full-width row; the inset section is
    // wrapped in a padded gutter section.
    expect(arranged.content[0]?.type).toBe("image");
    expect(arranged.content[1]?.type).toBe("section"); // gutter wrapper
    expect(arranged.content[1]?.attrs?.paddingLeft).toBe(32);
    expect(arranged.content[1]?.content?.[0]?.type).toBe("section"); // the inset section, nested
  });

  it("arrangeEmailRows is idempotent", () => {
    const once = arrangeEmailRows(createDefaultMailyDocument());
    const twice = arrangeEmailRows(once);
    expect(twice).toEqual(once);
  });

  it("keeps normal content inset via a padded section gutter", async () => {
    const rendered = await renderMailyDocument(createDefaultMailyDocument());

    // The 32px gutter now comes from the wrapping section (so sections without
    // padding can be full-width), and the container keeps its vertical padding.
    expect(rendered.html).toContain("padding-left:32px");
    expect(rendered.html).toContain("padding-top:32px");
    expect(rendered.html).toContain("max-width:680px");
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

  it("renders the per-email font choice and never the default Inter web font", async () => {
    const rendered = await renderMailyDocument(
      assertMailyDocument({ ...createDefaultMailyDocument(), fontKey: "georgia" }),
    );

    expect(rendered.html).toContain("Georgia");
    expect(rendered.html).not.toContain("-apple-system");
    expect(rendered.html).not.toContain("rsms.me");
  });

  it("round-trips the font key through layout get/apply (default = system)", () => {
    const blank = createDefaultMailyDocument();
    expect(getMailyDocumentFontKey(blank)).toBe(DEFAULT_EMAIL_FONT_KEY);
    expect(getMailyDocumentLayout(blank).fontKey).toBe(DEFAULT_EMAIL_FONT_KEY);

    const layout = { ...getMailyDocumentLayout(blank), fontKey: "mono" };
    const withFont = applyLayoutToDocument(blank, layout);
    expect(withFont.fontKey).toBe("mono");
    expect(getMailyDocumentLayout(withFont).fontKey).toBe("mono");

    // An unknown key falls back to the system default rather than leaking through.
    expect(getMailyDocumentFontKey(assertMailyDocument({ ...blank, fontKey: "comic-sans" }))).toBe(
      DEFAULT_EMAIL_FONT_KEY,
    );
  });

  it("defaults the card/backdrop colors and corner radius, and round-trips them", () => {
    const blank = createDefaultMailyDocument();
    const layout = getMailyDocumentLayout(blank);
    expect(layout.containerBackground).toBe(DEFAULT_CONTAINER_BACKGROUND);
    expect(layout.bodyBackground).toBe(DEFAULT_BODY_BACKGROUND);
    expect(layout.cornerRadius).toBe(DEFAULT_CORNER_RADIUS);

    const customized = applyLayoutToDocument(blank, {
      ...layout,
      containerBackground: "#101820",
      bodyBackground: "#fdf6e3",
      cornerRadius: 24,
    });
    const back = getMailyDocumentLayout(customized);
    expect(back.containerBackground).toBe("#101820");
    expect(back.bodyBackground).toBe("#fdf6e3");
    expect(back.cornerRadius).toBe(24);
  });

  it("sanitizes colors and clamps the corner radius", () => {
    expect(normalizeHexColor("#AbCdEf", "#ffffff")).toBe("#abcdef");
    // Anything that isn't a #rrggbb hex can't reach the email's inline styles.
    expect(normalizeHexColor("red;} body{display:none", "#ffffff")).toBe("#ffffff");
    expect(normalizeHexColor("#fff", "#ffffff")).toBe("#ffffff");
    expect(normalizeHexColor(42, "#ffffff")).toBe("#ffffff");
    expect(clampCornerRadius(9999)).toBe(MAX_CORNER_RADIUS);
    expect(clampCornerRadius(-10)).toBe(0);
  });

  it("renders the chosen card color, backdrop, and corner radius", async () => {
    const rendered = await renderMailyDocument(
      assertMailyDocument({
        ...createDefaultMailyDocument(),
        containerBackground: "#101820",
        bodyBackground: "#fdf6e3",
        cornerRadius: 20,
      }),
    );
    expect(rendered.html).toContain("#101820");
    expect(rendered.html).toContain("#fdf6e3");
    expect(rendered.html).toContain("border-radius:20px");
    // The mobile corner-squaring targets the actual radius value.
    expect(rendered.html).toContain('[style*="border-radius:20px"]');
  });

  it("ignores an injection-y color and falls back to defaults when rendering", async () => {
    const rendered = await renderMailyDocument(
      assertMailyDocument({
        ...createDefaultMailyDocument(),
        containerBackground: "#fff; } body { background: url(evil)",
      }),
    );
    expect(rendered.html).not.toContain("url(evil)");
    expect(rendered.html).toContain(DEFAULT_CONTAINER_BACKGROUND);
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
