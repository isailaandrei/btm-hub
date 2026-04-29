import { describe, expect, it } from "vitest";
import { renderMjmlEmail } from "./mjml";
import { interpolateEmailVariables } from "./variables";

describe("email rendering", () => {
  it("interpolates supported contact variables", () => {
    const result = interpolateEmailVariables(
      "Hi {{contact.name}} at {{contact.email}}",
      {
        contact: { name: "Alex", email: "alex@example.com" },
      },
    );

    expect(result).toBe("Hi Alex at alex@example.com");
  });

  it("renders MJML into HTML and text", async () => {
    const result = await renderMjmlEmail({
      subject: "Hello {{contact.name}}",
      mjml: "<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{contact.name}}</mj-text></mj-column></mj-section></mj-body></mjml>",
      variables: { contact: { name: "Alex", email: "alex@example.com" } },
    });

    expect(result.subject).toBe("Hello Alex");
    expect(result.html).toContain("Hello Alex");
    expect(result.text).toContain("Hello Alex");
  });

  it("decodes common HTML entities in plain-text output", async () => {
    const result = await renderMjmlEmail({
      subject: "Entity test",
      mjml: "<mjml><mj-body><mj-section><mj-column><mj-text>Research &amp; outreach&nbsp;&lt;ready&gt;</mj-text></mj-column></mj-section></mj-body></mjml>",
      variables: {},
    });

    expect(result.text).toContain("Research & outreach <ready>");
  });
});
