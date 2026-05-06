import { isSafeUrl } from "@/lib/validation-helpers";

type FilmCreditLinkInput = {
  label?: string | null;
  url?: string | null;
} | null;

export type FilmCreditInput = {
  role?: string | null;
  name?: string | null;
  teamMember?: {
    name?: string | null;
    slug?: { current?: string | null } | null;
  } | null;
  externalLinks?: FilmCreditLinkInput[] | null;
};

export type ResolvedFilmCredit = {
  name: string;
  role: string;
  href: string | null;
  externalLinks: { label: string; url: string }[];
  invalidLinkCount: number;
};

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function resolveFilmCredit(
  credit: FilmCreditInput,
): ResolvedFilmCredit {
  const teamSlug = cleanText(credit.teamMember?.slug?.current);
  const safeLinks: { label: string; url: string }[] = [];
  let invalidLinkCount = 0;

  for (const link of credit.externalLinks ?? []) {
    const url = cleanText(link?.url);
    if (!url) continue;

    if (!isSafeUrl(url)) {
      invalidLinkCount += 1;
      continue;
    }

    safeLinks.push({
      label: cleanText(link?.label) ?? "Link",
      url,
    });
  }

  const href = teamSlug
    ? `/team/${encodeURIComponent(teamSlug)}`
    : (safeLinks[0]?.url ?? null);

  return {
    name:
      cleanText(credit.teamMember?.name) ??
      cleanText(credit.name) ??
      "Unnamed credit",
    role: cleanText(credit.role) ?? "Credit",
    href,
    externalLinks: safeLinks,
    invalidLinkCount,
  };
}
