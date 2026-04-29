const TRACKED_REPLY_PATTERN =
  /^r-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@replies\.behind-the-mask\.com$/i;

export function extractRecipientIdFromReplyAddress(address: string): string | null {
  const email = address.trim().toLowerCase();
  const match = email.match(TRACKED_REPLY_PATTERN);
  return match?.[1] ?? null;
}
