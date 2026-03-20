import { cache } from "react";
import { getProgram } from "@/lib/academy/programs";
import { getProgramContent } from "@/lib/data/sanity";

/**
 * Merges static program config with CMS content.
 * Returns { config, cms } where cms is null if no CMS document exists yet.
 */
export const getProgramShowcase = cache(async function getProgramShowcase(
  slug: string,
) {
  const config = getProgram(slug);
  if (!config) return null;

  const cms = await getProgramContent(slug);

  return { config, cms: cms ?? null };
});
