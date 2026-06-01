"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCreateChatClient } from "stream-chat-react";
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
  onActiveThreadChange,
}: {
  payload: StreamTokenPayload;
  activeCid: string | null;
  onActiveThreadChange: (threadId: string, cid: string) => void;
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

  const client = useCreateChatClient({
    apiKey: payload.apiKey,
    tokenOrProvider: tokenProvider,
    userData: payload.user,
  });

  if (!client) {
    return <StreamChatConnectionState status="loading" />;
  }

  return (
    <StreamMessagesView
      activeCid={activeCid}
      client={client}
      onActiveThreadChange={onActiveThreadChange}
      userId={payload.user.id}
    />
  );
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
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId ?? null,
  );
  const [activeCid, setActiveCid] = useState<string | null>(initialCid ?? null);

  const handleActiveThreadChange = useCallback(
    (threadId: string, cid: string) => {
      if (threadId === activeThreadId && cid === activeCid) return;

      setActiveThreadId(threadId);
      setActiveCid(cid);
      router.replace(`/community/messages?thread=${encodeURIComponent(threadId)}`);
    },
    [activeCid, activeThreadId, router],
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

    let cancelled = false;

    async function startDirectConversation() {
      try {
        const response = await fetch("/api/stream/channels/direct", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipientId: startRecipientId }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Failed to start conversation",
          );
        }

        if (
          !cancelled &&
          typeof body.threadId === "string" &&
          typeof body.cid === "string"
        ) {
          setActiveThreadId(body.threadId);
          setActiveCid(body.cid);
          router.replace(
            `/community/messages?thread=${encodeURIComponent(body.threadId)}`,
          );
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
          setError(err instanceof Error ? err.message : "Failed to mark messages read");
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
    <ConnectedStreamChat
      activeCid={activeCid}
      onActiveThreadChange={handleActiveThreadChange}
      payload={payload}
    />
  );
}
