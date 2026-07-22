/**
 * Renders on both the server (UTC) and the viewer's browser (any timezone),
 * so the output must not depend on the runtime timezone: a late-evening UTC
 * timestamp would otherwise format to different calendar dates on the two
 * sides and break hydration (React #418) on every SSR'd contacts row.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}
