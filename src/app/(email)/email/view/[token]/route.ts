import { getEmailSendByPublicToken } from "@/lib/data/email-sends";
import {
  assertMailyDocument,
  renderMailyDocument,
} from "@/lib/email/rendering/maily";

// The web ("View in browser") version of a newsletter. Recipients land here from
// a link in the email, so it is intentionally a bare route handler that returns
// the email's own HTML document verbatim — no site chrome, nothing to navigate
// into. It renders the SHARED (non-personalized) version of the send: each
// variable falls back to its own default (e.g. "Hi there"), and the owner/sender
// values come from the send itself.

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  // Don't let the unreleased site's email pages get indexed.
  "x-robots-tag": "noindex, nofollow",
} as const;

function unavailablePage(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Email unavailable</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;color:#111827">
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">
<div style="max-width:420px;text-align:center">
<h1 style="font-size:18px;margin:0 0 8px">This email isn't available</h1>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">This link may be incorrect or the email may no longer be available online. You can safely close this window.</p>
</div></div></body></html>`;
  return new Response(html, { status: 404, headers: HTML_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const send = await getEmailSendByPublicToken(token);
  if (!send) return unavailablePage();

  let document;
  try {
    document = assertMailyDocument(send.builder_json_snapshot);
  } catch {
    return unavailablePage();
  }

  const { html } = await renderMailyDocument(document, {
    previewText: send.preview_text || undefined,
    variables: {
      owner: {
        name: send.from_name,
        email: send.from_email,
        replyToEmail: send.reply_to_email,
      },
    },
  });

  return new Response(html, { headers: HTML_HEADERS });
}
