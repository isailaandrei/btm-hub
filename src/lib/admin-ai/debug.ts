import { parseOptionalBooleanEnv } from "./env";

type DebugPayload = Record<string, unknown> | undefined;

export function isAdminAiDebugEnabled(): boolean {
  return parseOptionalBooleanEnv(process.env.DEBUG_ADMIN_AI) ?? false;
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
