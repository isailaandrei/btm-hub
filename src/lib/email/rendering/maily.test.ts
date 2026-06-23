import { describe, expect, it } from "vitest";
import {
  applyLayoutToDocument,
  assertMailyDocument,
  clampEmailWidth,
  createDefaultMailyDocument,
  DEFAULT_BODY_BACKGROUND,
  DEFAULT_CONTAINER_BACKGROUND,
  DEFAULT_EMAIL_FONT_KEY,
  DEFAULT_EMAIL_WIDTH,
  getAssetIdsForMailyDocument,
  getMailyDocumentFontKey,
  getMailyDocumentLayout,
  getMailyDocumentWidth,
  MAX_EMAIL_WIDTH,
  MIN_EMAIL_WIDTH,
  normalizeHexColor,
  renderMailyDocument,
  renderMailyEmail,
  arrangeEmailRows,
  CARD_GAP_ATTR,
  createCardGapSection,
  DEFAULT_CARD_GAP_HEIGHT,
  isCardGapSection,
  normalizeCardGapBands,
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

  it("defaults the card/backdrop colors and round-trips them", () => {
    const blank = createDefaultMailyDocument();
    const layout = getMailyDocumentLayout(blank);
    expect(layout.containerBackground).toBe(DEFAULT_CONTAINER_BACKGROUND);
    expect(layout.bodyBackground).toBe(DEFAULT_BODY_BACKGROUND);

    const customized = applyLayoutToDocument(blank, {
      ...layout,
      containerBackground: "#101820",
      bodyBackground: "#fdf6e3",
    });
    const back = getMailyDocumentLayout(customized);
    expect(back.containerBackground).toBe("#101820");
    expect(back.bodyBackground).toBe("#fdf6e3");
  });

  it("sanitizes colors so they can't inject into inline styles", () => {
    expect(normalizeHexColor("#AbCdEf", "#ffffff")).toBe("#abcdef");
    // Anything that isn't a #rrggbb hex can't reach the email's inline styles.
    expect(normalizeHexColor("red;} body{display:none", "#ffffff")).toBe("#ffffff");
    expect(normalizeHexColor("#fff", "#ffffff")).toBe("#ffffff");
    expect(normalizeHexColor(42, "#ffffff")).toBe("#ffffff");
  });

  it("renders the chosen card color and backdrop", async () => {
    const rendered = await renderMailyDocument(
      assertMailyDocument({
        ...createDefaultMailyDocument(),
        containerBackground: "#101820",
        bodyBackground: "#fdf6e3",
      }),
    );
    expect(rendered.html).toContain("#101820");
    expect(rendered.html).toContain("#fdf6e3");
  });

  it("always renders a square card, even if a stored radius is present", async () => {
    const rendered = await renderMailyDocument(
      // A legacy document may still carry a corner radius; it must be ignored.
      assertMailyDocument({ ...createDefaultMailyDocument(), cornerRadius: 20 }),
    );
    expect(rendered.html).toContain("border-radius:0px");
    expect(rendered.html).not.toContain("border-radius:20px");
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
    // The card is always square.
    expect(rendered.html).toContain("border-radius:0px");
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

  it("resolves a hand-added Unsubscribe button (url = unsubscribe.url variable)", async () => {
    const document = assertMailyDocument({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Bye" }] },
        {
          type: "button",
          attrs: {
            text: "Unsubscribe",
            url: "unsubscribe.url",
            isUrlVariable: true,
            variant: "filled",
            buttonColor: "#111827",
            textColor: "#ffffff",
            borderRadius: "smooth",
            alignment: "left",
          },
        },
      ],
    });

    const rendered = await renderMailyEmail({
      subject: "x",
      document,
      variables: {
        unsubscribe: { url: "https://hub.example.com/email/unsubscribe/zzz" },
      },
    });

    // The button's variable URL resolves to the per-recipient link — proving an
    // admin can add their own Unsubscribe control when the footer is off.
    expect(rendered.html).toContain(
      "https://hub.example.com/email/unsubscribe/zzz",
    );
    expect(rendered.html).not.toContain(">unsubscribe.url<");
    expect(rendered.html).not.toContain("{{unsubscribe.url}}");
  });

  it("builds a card-split band: full-width, marked, no border, spacer height", () => {
    const band = createCardGapSection("#f3f4f6");

    expect(band.type).toBe("section");
    expect(band.attrs?.[CARD_GAP_ATTR]).toBe("true");
    expect(band.attrs?.fullwidth).toBe("true");
    expect(band.attrs?.backgroundColor).toBe("#f3f4f6");
    expect(band.attrs?.borderWidth).toBe(0);
    // A spacer carries the band height so it reads as a separation.
    expect(band.content?.[0]?.type).toBe("spacer");
    expect(band.content?.[0]?.attrs?.height).toBe(DEFAULT_CARD_GAP_HEIGHT);

    expect(isCardGapSection(band)).toBe(true);
    // A normal section is not a card-split band.
    expect(isCardGapSection({ type: "section", attrs: {}, content: [] })).toBe(
      false,
    );
  });

  it("normalizes card-split bands: backdrop color, padding height, no spacer", () => {
    const document = assertMailyDocument({
      type: "doc",
      content: [
        // Stored band color is intentionally wrong — paint must override it.
        createCardGapSection("#000000", 24),
        { type: "section", attrs: { backgroundColor: "#123456" }, content: [] },
      ],
    });

    const normalized = normalizeCardGapBands(document, "#abcdef");

    const band = normalized.content[0];
    expect(band?.attrs?.backgroundColor).toBe("#abcdef");
    // The width-capped inner spacer is gone; height moves to symmetric padding.
    expect(band?.content).toEqual([]);
    expect(band?.attrs?.paddingTop).toBe(12);
    expect(band?.attrs?.paddingBottom).toBe(12);
    // A regular colored section is left untouched.
    expect(normalized.content[1]?.attrs?.backgroundColor).toBe("#123456");
    // Non-destructive: the input still has its spacer and stored color.
    expect(document.content[0]?.attrs?.backgroundColor).toBe("#000000");
    expect(document.content[0]?.content?.[0]?.type).toBe("spacer");
  });

  it("renders a card-split band full-width, in the backdrop color", async () => {
    const rendered = await renderMailyDocument(
      assertMailyDocument({
        type: "doc",
        bodyBackground: "#fdf6e3",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Card A" }] },
          // Stored as a different color; render must repaint it to the backdrop
          // so the split illusion holds even if the backdrop changed afterwards.
          createCardGapSection("#000000"),
          { type: "paragraph", content: [{ type: "text", text: "Card B" }] },
        ],
      }),
    );

    // The band tracks the backdrop, and the stale stored color never ships.
    expect(rendered.html).toContain("#fdf6e3");
    expect(rendered.html).not.toContain("#000000");
    // The band must NOT render a width-capped spacer (~600px), which would leave
    // the band narrower than a wider card and rejoin the two halves at the edges.
    expect(rendered.html).not.toContain("max-width:37.5em");
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
