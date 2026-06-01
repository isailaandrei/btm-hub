import "server-only";

export interface StreamChatConfig {
  apiKey: string;
  apiSecret: string;
  tokenTtlSeconds: number;
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getStreamChatConfig(): StreamChatConfig {
  const apiKey = clean(process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY);
  const apiSecret = clean(process.env.STREAM_CHAT_API_SECRET);
  const tokenTtlSeconds = Number.parseInt(
    clean(process.env.STREAM_CHAT_TOKEN_TTL_SECONDS) ?? "86400",
    10,
  );
  const missing = [
    apiKey ? null : "NEXT_PUBLIC_STREAM_CHAT_API_KEY",
    apiSecret ? null : "STREAM_CHAT_API_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing Stream Chat configuration: ${missing.join(", ")}`);
  }

  if (!apiKey || !apiSecret) {
    throw new Error("Missing Stream Chat configuration");
  }

  if (!Number.isFinite(tokenTtlSeconds) || tokenTtlSeconds < 300) {
    throw new Error("STREAM_CHAT_TOKEN_TTL_SECONDS must be at least 300 seconds");
  }

  return {
    apiKey,
    apiSecret,
    tokenTtlSeconds,
  };
}
