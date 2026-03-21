export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanum with hyphens
    .replace(/-{2,}/g, "-") // collapse consecutive hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .slice(0, 80);
}

export function slugifyUnique(text: string): string {
  const base = slugify(text);
  const suffix = Math.random().toString(36).slice(2, 8);
  // Ensure total length <= 86 (80 slug + 1 hyphen + 6 suffix)
  return `${base.slice(0, 79)}-${suffix}`;
}
