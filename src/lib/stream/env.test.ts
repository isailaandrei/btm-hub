import { afterEach, describe, expect, it, vi } from "vitest";
import { getStreamChatConfig } from "./env";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = process.env;

function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("getStreamChatConfig", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("throws a clear error when Stream env vars are missing", async () => {
    process.env = testEnv();

    expect(() => getStreamChatConfig()).toThrow(
      "Missing Stream Chat configuration: NEXT_PUBLIC_STREAM_CHAT_API_KEY, STREAM_CHAT_API_SECRET",
    );
  });

  it("returns trimmed Stream env vars when configured", async () => {
    process.env = testEnv({
      NEXT_PUBLIC_STREAM_CHAT_API_KEY: " api-key ",
      STREAM_CHAT_API_SECRET: " secret ",
    });

    expect(getStreamChatConfig()).toEqual({
      apiKey: "api-key",
      apiSecret: "secret",
      tokenTtlSeconds: 86_400,
    });
  });

  it("allows the Stream token TTL to be configured", async () => {
    process.env = testEnv({
      NEXT_PUBLIC_STREAM_CHAT_API_KEY: "api-key",
      STREAM_CHAT_API_SECRET: "secret",
      STREAM_CHAT_TOKEN_TTL_SECONDS: "3600",
    });

    expect(getStreamChatConfig()).toMatchObject({
      tokenTtlSeconds: 3_600,
    });
  });
});
