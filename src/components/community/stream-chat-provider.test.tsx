import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamChatConnectionState } from "./stream-chat-provider";

describe("StreamChatConnectionState", () => {
  it("renders a loading state while connecting", () => {
    const html = renderToStaticMarkup(
      <StreamChatConnectionState status="loading" />,
    );

    expect(html).toContain("Connecting to messages");
  });

  it("renders an auth error when token loading is unauthorized", () => {
    const html = renderToStaticMarkup(
      <StreamChatConnectionState status="error" message="Unauthorized" />,
    );

    expect(html).toContain("You need to sign in to use messages.");
  });

  it("renders a visible configuration error for other failures", () => {
    const html = renderToStaticMarkup(
      <StreamChatConnectionState
        status="error"
        message="Missing Stream Chat configuration"
      />,
    );

    expect(html).toContain("Messages are unavailable");
    expect(html).toContain("Missing Stream Chat configuration");
  });
});
