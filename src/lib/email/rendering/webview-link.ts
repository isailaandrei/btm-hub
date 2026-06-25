/**
 * Inject a small "View in browser" link at the top of a rendered email, shown to
 * every client. It gives recipients an escape hatch when an email renders poorly
 * (most useful in Outlook, which clips long emails at ~1790px, but a standard,
 * harmless newsletter convention everywhere).
 *
 * Placement: just before the email's container card (the `max-width:<width>px`
 * table), which sits inside the backdrop after the hidden preheader. This keeps
 * the link above the content but AFTER the preheader, so it never hijacks the
 * inbox preview text. Pure additive string injection — no conditional comments,
 * no renderer changes.
 */
export function injectWebviewLink(
  html: string,
  url: string,
  width: number,
): string {
  if (!url) return html;

  const snippet =
    `<table role="presentation" width="100%" border="0" cellpadding="0" ` +
    `cellspacing="0"><tbody><tr>` +
    `<td align="center" style="padding:0 16px 20px;font-family:Arial,Helvetica,` +
    `sans-serif;font-size:12px;line-height:18px;color:#9ca3af">` +
    `Trouble viewing this email? ` +
    `<a href="${url}" target="_blank" ` +
    `style="color:#9ca3af;text-decoration:underline">View it in your browser</a>` +
    `</td></tr></tbody></table>`;

  // Inject right before the container card so the link lands after the preheader
  // and on the backdrop, above the content.
  const marker = `max-width:${width}px`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx !== -1) {
    const cardStart = html.lastIndexOf("<table", markerIdx);
    if (cardStart !== -1) {
      return html.slice(0, cardStart) + snippet + html.slice(cardStart);
    }
  }

  // Fallback: top of the body (still shows; only reached if the card can't be
  // located, which shouldn't happen for a normally rendered email).
  const bodyOpen = html.search(/<body\b[^>]*>/i);
  if (bodyOpen === -1) return html;
  const insertAt = html.indexOf(">", bodyOpen) + 1;
  return html.slice(0, insertAt) + snippet + html.slice(insertAt);
}
