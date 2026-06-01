/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("stream-chat-react", () => ({
  useCreateChatClient: () => ({ userID: "user-1" }),
}));

vi.mock("./stream-messages-view", () => ({
  StreamMessagesView: ({
    channelListVersion,
    onActiveThreadChange,
    onStartDirectConversation,
  }: {
    channelListVersion?: number;
    onActiveThreadChange?: (threadId: string, cid: string) => void;
    onStartDirectConversation?: (recipientId: string) => Promise<void>;
  }) => (
    <div data-channel-list-version={channelListVersion} data-testid="stream-messages-view">
      <button
        data-testid="select-channel"
        onClick={() =>
          onActiveThreadChange?.(
            "00000000-0000-4000-8000-000000000088",
            "messaging:00000000-0000-4000-8000-000000000088",
          )
        }
        type="button"
      >
        Select channel
      </button>
      <button
        data-testid="start-direct"
        onClick={() =>
          void onStartDirectConversation?.("00000000-0000-4000-8000-000000000002")
        }
        type="button"
      >
        Start direct
      </button>
    </div>
  ),
}));

const { StreamChatProvider } = await import("./stream-chat-provider");

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

describe("StreamChatProvider client effects", () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/stream/token") {
        return Response.json({
          apiKey: "stream-key",
          token: "stream-token",
          user: { id: "user-1", name: "User One" },
        });
      }

      if (url === "/api/stream/notifications/read") {
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("marks notifications read for the active Stream channel", async () => {
    await act(async () => {
      root.render(
        <StreamChatProvider
          initialThreadId="00000000-0000-4000-8000-000000000099"
          initialCid="messaging:00000000-0000-4000-8000-000000000099"
        />,
      );
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stream/notifications/read",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ threadId: "00000000-0000-4000-8000-000000000099" }),
        }),
      );
    });
  });

  it("rewrites started direct conversations to the app-owned thread URL", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/stream/token") {
        return Response.json({
          apiKey: "stream-key",
          token: "stream-token",
          user: { id: "user-1", name: "User One" },
        });
      }

      if (url === "/api/stream/channels/direct") {
        return Response.json({
          threadId: "00000000-0000-4000-8000-000000000099",
          cid: "messaging:00000000-0000-4000-8000-000000000099",
        });
      }

      if (url === "/api/stream/notifications/read") {
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Unexpected request" }, { status: 500 });
    });

    await act(async () => {
      root.render(
        <StreamChatProvider startRecipientId="00000000-0000-4000-8000-000000000002" />,
      );
    });

    await waitForAssertion(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/community/messages?thread=00000000-0000-4000-8000-000000000099",
      );
    });
  });

  it("starts direct conversations from the messages view and refreshes the list", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/stream/token") {
        return Response.json({
          apiKey: "stream-key",
          token: "stream-token",
          user: { id: "user-1", name: "User One" },
        });
      }

      if (url === "/api/stream/channels/direct") {
        return Response.json({
          threadId: "00000000-0000-4000-8000-000000000099",
          cid: "messaging:00000000-0000-4000-8000-000000000099",
        });
      }

      if (url === "/api/stream/notifications/read") {
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Unexpected request" }, { status: 500 });
    });

    await act(async () => {
      root.render(<StreamChatProvider />);
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Start direct");
    });

    const button = container.querySelector('[data-testid="start-direct"]');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stream/channels/direct",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            recipientId: "00000000-0000-4000-8000-000000000002",
          }),
        }),
      );
      expect(mocks.replace).toHaveBeenCalledWith(
        "/community/messages?thread=00000000-0000-4000-8000-000000000099",
      );
      expect(
        container
          .querySelector('[data-testid="stream-messages-view"]')
          ?.getAttribute("data-channel-list-version"),
      ).toBe("1");
    });
  });

  it("marks notifications read when the Stream channel list selects another app thread", async () => {
    await act(async () => {
      root.render(
        <StreamChatProvider
          initialThreadId="00000000-0000-4000-8000-000000000099"
          initialCid="messaging:00000000-0000-4000-8000-000000000099"
        />,
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Select channel");
    });

    const button = container.querySelector('[data-testid="select-channel"]');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stream/notifications/read",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ threadId: "00000000-0000-4000-8000-000000000088" }),
        }),
      );
      expect(mocks.replace).toHaveBeenCalledWith(
        "/community/messages?thread=00000000-0000-4000-8000-000000000088",
      );
    });
  });

  it("keeps messages usable when marking notifications read fails", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/stream/token") {
        return Response.json({
          apiKey: "stream-key",
          token: "stream-token",
          user: { id: "user-1", name: "User One" },
        });
      }

      if (url === "/api/stream/notifications/read") {
        return Response.json(
          { error: "Read state temporarily unavailable" },
          { status: 503 },
        );
      }

      return Response.json({ error: "Unexpected request" }, { status: 500 });
    });

    await act(async () => {
      root.render(
        <StreamChatProvider
          initialThreadId="00000000-0000-4000-8000-000000000099"
          initialCid="messaging:00000000-0000-4000-8000-000000000099"
        />,
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Select channel");
      expect(container.textContent).toContain("Read state temporarily unavailable");
      expect(container.textContent).not.toContain("Messages are unavailable");
    });
  });
});
