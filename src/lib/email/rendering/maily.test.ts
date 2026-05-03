import { describe, expect, it } from "vitest";
import {
  assertMailyDocument,
  createDefaultMailyDocument,
  getAssetIdsForMailyDocument,
  renderMailyDocument,
  renderMailyEmail,
} from "./maily";

describe("Maily rendering", () => {
  it("creates a default Maily document for new templates", () => {
    const document = createDefaultMailyDocument();

    expect(document.type).toBe("doc");
    expect(document.content?.some((node) => node.type === "heading")).toBe(true);
    expect(JSON.stringify(document)).toContain("contact.name");
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
});
