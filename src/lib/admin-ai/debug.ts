type DebugPayload = Record<string, unknown> | undefined;

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export function isAdminAiDebugEnabled(): boolean {
  return parseBooleanEnv(process.env.DEBUG_ADMIN_AI);
}

export function adminAiDebugLog(event: string, payload?: DebugPayload): void {
  if (!isAdminAiDebugEnabled()) return;
  if (payload) {
    console.info(`[admin-ai][debug] ${event}`, payload);
    return;
  }
  console.info(`[admin-ai][debug] ${event}`);
}

export function startAdminAiDebugTimer(
  event: string,
  basePayload?: DebugPayload,
): { end: (extraPayload?: DebugPayload) => void } {
  const startedAt = Date.now();
  return {
    end(extraPayload) {
      if (!isAdminAiDebugEnabled()) return;
      adminAiDebugLog(event, {
        ...(basePayload ?? {}),
        ...(extraPayload ?? {}),
        durationMs: Date.now() - startedAt,
      });
    },
  };
}
