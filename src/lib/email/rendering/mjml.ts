import mjml2html from "mjml";
import {
  interpolateEmailVariables,
  type EmailRenderVariables,
} from "./variables";

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function renderMjmlEmail(input: {
  subject: string;
  mjml: string;
  variables: EmailRenderVariables;
}) {
  const subject = interpolateEmailVariables(input.subject, input.variables);
  const mjml = interpolateEmailVariables(input.mjml, input.variables);
  const rendered = await mjml2html(mjml, { validationLevel: "strict" });
  const errors = rendered.errors ?? [];

  if (errors.length > 0) {
    throw new Error(
      errors.map((error) => error.formattedMessage).join("; "),
    );
  }

  return {
    subject,
    html: rendered.html,
    text: htmlToText(rendered.html),
  };
}
