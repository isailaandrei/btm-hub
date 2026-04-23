/**
 * Kill switch for AI-driven dossier rebuilds.
 *
 * Set `ADMIN_AI_DISABLE_REBUILDS=1` (or `true` / `on` / `yes`) to
 * short-circuit every synchronous + background rebuild triggered from
 * an admin AI read path. Structural sync (tags, notes, facts projections)
 * still runs — only the OpenAI rebuild is suppressed.
 *
 * Intended as a temporary hold while iterating on prompts / models.
 * When cleared, rebuilds resume; contacts still flagged stale catch up
 * on the next AI query or via the standalone backfill CLI.
 *
 * Read from env on every call so toggling the Vercel variable takes
 * effect on the next serverless invocation without a redeploy.
 */
export function areAiRebuildsDisabled(): boolean {
  const raw = process.env.ADMIN_AI_DISABLE_REBUILDS?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
