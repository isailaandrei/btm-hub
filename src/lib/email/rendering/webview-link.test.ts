import { describe, expect, it } from "vitest";
import { injectWebviewLink } from "./webview-link";

// Mirrors the rendered top: backdrop cell with a hidden preheader, then the
// max-width container card.
const html =
  `<html><head></head><body style="background:#f3f4f6">` +
  `<table><tbody><tr><td style="padding-top:32px">` +
  `<div style="display:none" data-skip-in-text="true">PREVIEW</div>` +
  `<table role="presentation" style="max-width:640px;width:100%">` +
  `<tbody><tr><td>email content</td></tr></tbody></table>` +
  `</td></tr></tbody></table></body></html>`;
const url = "https://btm.test/email/view/tok-123";

describe("injectWebviewLink", () => {
  it("adds a visible link to every client (no conditional comment)", () => {
    const out = injectWebviewLink(html, url, 640);
    expect(out).toContain(url);
    expect(out).toContain("View it in your browser");
    expect(out).not.toContain("[if mso]");
    expect(out).toContain("email content");
  });

  it("places the link after the preheader but before the container card", () => {
    const out = injectWebviewLink(html, url, 640);
    const linkIdx = out.indexOf("View it in your browser");
    const preheaderIdx = out.indexOf("data-skip-in-text");
    const cardIdx = out.indexOf("max-width:640px");
    expect(preheaderIdx).toBeLessThan(linkIdx); // doesn't hijack preview text
    expect(linkIdx).toBeLessThan(cardIdx); // sits above the content card
  });

  it("no-ops on an empty url", () => {
    expect(injectWebviewLink(html, "", 640)).toBe(html);
  });

  it("falls back to the top of the body when the card can't be located", () => {
    const noCard = `<html><body><p>hi</p></body></html>`;
    const out = injectWebviewLink(noCard, url, 640);
    expect(out).toContain("View it in your browser");
    const bodyTagEnd = out.indexOf(">", out.search(/<body\b/i)) + 1;
    expect(out.slice(bodyTagEnd).startsWith("<table")).toBe(true);
  });
});
