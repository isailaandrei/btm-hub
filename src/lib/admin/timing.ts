type AdminTimingMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

const PRODUCTION_THRESHOLD_MS = 500;

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function compactMetadata(metadata: AdminTimingMetadata | undefined) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

export function startAdminTiming() {
  return now();
}

export function logAdminTiming(
  label: string,
  startedAt: number,
  metadata?: AdminTimingMetadata,
  options?: { thresholdMs?: number },
) {
  const durationMs = Math.round(now() - startedAt);
  const thresholdMs =
    options?.thresholdMs ??
    (process.env.NODE_ENV === "production" ? PRODUCTION_THRESHOLD_MS : 0);

  if (durationMs < thresholdMs) return durationMs;

  const details = compactMetadata(metadata);
  if (Object.keys(details).length > 0) {
    console.info(`[admin timing] ${label} ${durationMs}ms`, details);
  } else {
    console.info(`[admin timing] ${label} ${durationMs}ms`);
  }

  return durationMs;
}

