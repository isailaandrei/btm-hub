"use client";

import "stream-chat-react/dist/css/index.css";
import "./stream-chat.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { StreamChat } from "stream-chat";
import { StreamMessagesView } from "./stream-messages-view";

interface StreamUserPayload {
  id: string;
  name: string;
  image?: string;
}

interface StreamTokenPayload {
  apiKey: string;
  token: string;
  expiresAt: number;
  user: StreamUserPayload;
}

type ConnectionStatus = "loading" | "error";

const STREAM_DISCONNECT_GRACE_MS = 750;

export function StreamChatConnectionState({
  status,
  message,
}: {
  status: ConnectionStatus;
  message?: string;
}) {
  if (status === "loading") {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Connecting to messages...</p>
      </div>
    );
  }

  const isUnauthorized = message === "Unauthorized";

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <MessageSquareWarning className="h-8 w-8 text-destructive" />
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {isUnauthorized ? "Sign in required" : "Messages are unavailable"}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {isUnauthorized
            ? "You need to sign in to use messages."
            : (message ?? "Unable to connect to the messaging service.")}
        </p>
      </div>
    </div>
  );
}

function ConnectedStreamChat({
  payload,
  activeCid,
  channelListVersion,
  onActiveThreadChange,
  onStartDirectConversation,
}: {
  payload: StreamTokenPayload;
  activeCid: string | null;
  channelListVersion: number;
  onActiveThreadChange: (threadId: string, cid: string) => void;
  onStartDirectConversation: (recipientId: string) => Promise<void>;
}) {
  const initialTokenRef = useRef(payload.token);
  const tokenProvider = useCallback(async () => {
    if (initialTokenRef.current) {
      const token = initialTokenRef.current;
      initialTokenRef.current = "";
      return token;
    }

    const response = await fetch("/api/stream/token", {
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || typeof body.token !== "string") {
      throw new Error(
        typeof body.error === "string" ? body.error : "Failed to refresh Stream token",
      );
    }

    return body.token;
  }, []);

  const { client, error } = useManagedStreamChatClient({
    apiKey: payload.apiKey,
    userData: payload.user,
    tokenProvider,
  });

  if (error) {
    return <StreamChatConnectionState status="error" message={error} />;
  }

  if (!client) {
    return <StreamChatConnectionState status="loading" />;
  }

  return (
    <StreamMessagesView
      activeCid={activeCid}
      channelListVersion={channelListVersion}
      client={client}
      onActiveThreadChange={onActiveThreadChange}
      onStartDirectConversation={onStartDirectConversation}
      userId={payload.user.id}
    />
  );
}

function useManagedStreamChatClient({
  apiKey,
  tokenProvider,
  userData,
}: {
  apiKey: string;
  tokenProvider: () => Promise<string>;
  userData: StreamUserPayload;
}) {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const streamClient = new StreamChat(apiKey);
    let cancelled = false;

    const connectionPromise = streamClient.connectUser(userData, tokenProvider);

    async function connect() {
      setError(null);

      try {
        await connectionPromise;

        if (!cancelled) {
          setClient(streamClient);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to connect to Stream");
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      setClient(null);

      setTimeout(() => {
        void connectionPromise
          .catch(() => undefined)
          .then(() => streamClient.disconnectUser())
          .catch((err: unknown) => {
            console.warn("Failed to disconnect Stream client", err);
          });
      }, STREAM_DISCONNECT_GRACE_MS);
    };
  }, [apiKey, tokenProvider, userData]);

  return { client, error };
}

async function createDirectConversation(recipientId: string) {
  const response = await fetch("/api/stream/channels/direct", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientId }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Failed to start conversation",
    );
  }

  if (typeof body.threadId !== "string" || typeof body.cid !== "string") {
    throw new Error("Conversation response was incomplete");
  }

  return body as { threadId: string; cid: string };
}

export function StreamChatProvider({
  startRecipientId,
  initialThreadId,
  initialCid,
}: {
  startRecipientId?: string | null;
  initialThreadId?: string | null;
  initialCid?: string | null;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<StreamTokenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readWarning, setReadWarning] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId ?? null,
  );
  const [activeCid, setActiveCid] = useState<string | null>(initialCid ?? null);
  const [channelListVersion, setChannelListVersion] = useState(0);
  const startedRecipientRef = useRef<string | null>(null);

  const handleActiveThreadChange = useCallback(
    (threadId: string, cid: string) => {
      if (threadId === activeThreadId && cid === activeCid) return;

      setActiveThreadId(threadId);
      setActiveCid(cid);
      router.replace(`/community/messages?thread=${encodeURIComponent(threadId)}`);
    },
    [activeCid, activeThreadId, router],
  );

  const handleStartDirectConversation = useCallback(
    async (recipientId: string) => {
      const { threadId, cid } = await createDirectConversation(recipientId);

      setActiveThreadId(threadId);
      setActiveCid(cid);
      setChannelListVersion((version) => version + 1);
      router.replace(`/community/messages?thread=${encodeURIComponent(threadId)}`);
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadToken() {
      setError(null);
      try {
        const response = await fetch("/api/stream/token", {
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Failed to load Stream token",
          );
        }

        if (!cancelled) {
          setPayload(body as StreamTokenPayload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Stream token");
        }
      }
    }

    loadToken();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!startRecipientId) return;
    if (startedRecipientRef.current === startRecipientId) return;

    const recipientId = startRecipientId;
    startedRecipientRef.current = recipientId;

    let cancelled = false;

    async function startDirectConversation() {
      try {
        const { threadId, cid } = await createDirectConversation(recipientId);

        if (!cancelled) {
          setActiveThreadId(threadId);
          setActiveCid(cid);
          setChannelListVersion((version) => version + 1);
          router.replace(`/community/messages?thread=${encodeURIComponent(threadId)}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start conversation");
        }
      }
    }

    startDirectConversation();

    return () => {
      cancelled = true;
    };
  }, [router, startRecipientId]);

  useEffect(() => {
    if (!payload || !activeThreadId) return;

    let cancelled = false;

    async function markActiveChannelRead() {
      try {
        setReadWarning(null);
        const response = await fetch("/api/stream/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: activeThreadId }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Failed to mark messages read",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setReadWarning(
            err instanceof Error ? err.message : "Failed to mark messages read",
          );
        }
      }
    }

    markActiveChannelRead();

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, payload]);

  if (error) {
    return <StreamChatConnectionState status="error" message={error} />;
  }

  if (!payload) {
    return <StreamChatConnectionState status="loading" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {readWarning && (
        <div
          aria-live="polite"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {readWarning}
        </div>
      )}
      <ConnectedStreamChat
        activeCid={activeCid}
        channelListVersion={channelListVersion}
        onActiveThreadChange={handleActiveThreadChange}
        onStartDirectConversation={handleStartDirectConversation}
        payload={payload}
      />
    </div>
  );
}
