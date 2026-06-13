export type SocialLinkPart =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

const URL_PATTERN = /(?:https?:\/\/|www\.|(?:instagram|youtube|youtu|tiktok|linkedin|facebook|x|twitter)\.com\/)[^\s,;<>]+/gi;
const AT_HANDLE_PATTERN = /@[A-Za-z0-9._]{1,30}/g;
const INSTAGRAM_CUE_HANDLE_PATTERN = /\b(?:instagram|insta|ig)\b\s*[:\-]?\s*@?([A-Za-z0-9._]{1,30})/gi;
const BARE_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

function trimTrailingPunctuation(value: string): { core: string; trailing: string } {
  const match = value.match(/^(.+?)([.)\]]*)$/);
  if (!match) return { core: value, trailing: "" };
  return { core: match[1] ?? value, trailing: match[2] ?? "" };
}

function normalizeUrl(raw: string): string {
  const { core } = trimTrailingPunctuation(raw.trim());
  const withProtocol = /^https?:\/\//i.test(core) ? core : `https://${core}`;

  try {
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "instagram.com") {
      const handle = url.pathname.split("/").filter(Boolean)[0];
      if (handle) return instagramHref(handle);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return withProtocol;
  }
}

function instagramHref(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, "")}`;
}

function appendText(parts: SocialLinkPart[], text: string): void {
  if (!text) return;
  const previous = parts[parts.length - 1];
  if (previous?.type === "text") {
    previous.text += text;
    return;
  }
  parts.push({ type: "text", text });
}

function addLinkRanges(
  ranges: Array<{ start: number; end: number; text: string; href: string }>,
  start: number,
  end: number,
  text: string,
  href: string,
): void {
  if (ranges.some((range) => start < range.end && end > range.start)) return;
  ranges.push({ start, end, text, href });
}

export function parseSocialLinkText(input: string): SocialLinkPart[] {
  const text = input.trim();
  if (!text) return [];

  if (BARE_HANDLE_PATTERN.test(text) && !text.includes(".")) {
    return [{ type: "link", text, href: instagramHref(text) }];
  }

  const ranges: Array<{ start: number; end: number; text: string; href: string }> = [];

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    const { core, trailing } = trimTrailingPunctuation(raw);
    addLinkRanges(ranges, start, start + core.length, core, normalizeUrl(core));
    if (trailing) {
      // Leave trailing punctuation as normal text.
    }
  }

  for (const match of text.matchAll(AT_HANDLE_PATTERN)) {
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    addLinkRanges(ranges, start, start + raw.length, raw, instagramHref(raw));
  }

  for (const match of text.matchAll(INSTAGRAM_CUE_HANDLE_PATTERN)) {
    const handle = match[1] ?? "";
    if (!handle || handle.startsWith("http") || handle.startsWith("www.")) continue;
    const full = match[0] ?? "";
    const cueIndex = match.index ?? 0;
    const start = cueIndex + full.lastIndexOf(handle);
    addLinkRanges(ranges, start, start + handle.length, handle, instagramHref(handle));
  }

  if (ranges.length === 0) return [{ type: "text", text }];

  ranges.sort((a, b) => a.start - b.start);
  const parts: SocialLinkPart[] = [];
  let cursor = 0;
  for (const range of ranges) {
    appendText(parts, text.slice(cursor, range.start));
    parts.push({ type: "link", text: range.text, href: range.href });
    cursor = range.end;
  }
  appendText(parts, text.slice(cursor));
  return parts;
}
