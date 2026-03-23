import { describe, expect, it } from "vitest";
import { sanitizeBody } from "./sanitize";

describe("sanitizeBody", () => {
  it("preserves valid HTML tags", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeBody(html)).toBe(html);
  });

  it("strips script tags", () => {
    const html = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeBody(html)).toBe("<p>Hello</p>");
  });

  it("strips event handler attributes", () => {
    const html = '<img src="photo.jpg" onerror="alert(1)" />';
    const result = sanitizeBody(html);
    expect(result).not.toContain("onerror");
    expect(result).toContain("photo.jpg");
  });

  it("strips javascript: URLs from links", () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeBody(html);
    expect(result).not.toContain("javascript:");
  });

  it("preserves mention spans with data attributes", () => {
    const html = '<span data-type="mention" data-id="abc-123" data-label="John">@John</span>';
    const result = sanitizeBody(html);
    expect(result).toContain('data-type="mention"');
    expect(result).toContain('data-id="abc-123"');
    expect(result).toContain('data-label="John"');
  });

  it("strips disallowed data-type values from spans", () => {
    const html = '<span data-type="evil" data-id="abc">text</span>';
    const result = sanitizeBody(html);
    expect(result).not.toContain('data-type="evil"');
  });

  it("strips iframe tags", () => {
    const html = '<iframe src="https://evil.com"></iframe><p>Safe</p>';
    expect(sanitizeBody(html)).toBe("<p>Safe</p>");
  });

  it("forces target=_blank and rel=noopener on links", () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = sanitizeBody(html);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("preserves heading tags", () => {
    const html = "<h1>Title</h1><h2>Sub</h2><h3>Sub-sub</h3>";
    expect(sanitizeBody(html)).toBe(html);
  });

  it("preserves list tags", () => {
    const html = "<ul><li>One</li><li>Two</li></ul>";
    expect(sanitizeBody(html)).toBe(html);
  });

  it("preserves code blocks", () => {
    const html = "<pre><code>const x = 1;</code></pre>";
    expect(sanitizeBody(html)).toBe(html);
  });
});
