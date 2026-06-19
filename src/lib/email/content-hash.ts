import { createHash } from "node:crypto";

/**
 * Deterministically serialize a JSON value so logically-identical documents
 * produce byte-identical strings regardless of object key order. Arrays keep
 * their order (it is meaningful in a Maily document); object keys are sorted.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    // Drop `undefined` values so they don't change the hash vs. an absent key.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)
    .join(",")}}`;
}

/**
 * Content hash of a Maily document, used to deduplicate auto-saved templates.
 *
 * The hash covers the whole builder document (body + layout attributes), which
 * is exactly the template's identity per the email-studio spec — subject and
 * preview text live outside the document and are intentionally NOT part of it,
 * so two sends that differ only by subject reuse the same template.
 */
export function computeMailyContentHash(builderJson: unknown): string {
  return createHash("sha256").update(stableStringify(builderJson)).digest("hex");
}
