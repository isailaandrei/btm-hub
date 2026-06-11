import { createHash } from "node:crypto";
import {
  appendConversationFacts,
  conversationDigestExists,
  listConversationMessagesForDigest,
  upsertConversationDigest,
  upsertConversationEmbeddings,
} from "@/lib/data/conversations";
import { extractConversationDigest } from "./digest-provider";
import { buildConversationEmbeddingRows } from "./embeddings";
import { buildConversationFactInputs } from "./facts";
import type { ConversationSource } from "./ingestion/adapter";

export const DIGEST_GENERATOR_VERSION = "conversation-digest-v1";
export const DIGEST_WINDOW_SESSION_GAP_MS = 30 * 60 * 1000;

export type DigestWindowMessage = {
  id: string;
  contactId: string;
  body: string;
  happenedAt: string;
};

export type DigestWindow = {
  contactId: string;
  source: ConversationSource;
  windowStart: string;
  windowEnd: string;
  firstMessageId: string;
  lastMessageId: string;
  sourceMessageCount: number;
  contentHash: string;
  transcript: string;
};

export function buildDigestContentHash(messageIds: string[]): string {
  return createHash("sha256")
    .update(DIGEST_GENERATOR_VERSION)
    .update("\u0001")
    .update([...messageIds].sort().join("\u0001"))
    .digest("hex");
}

export function buildDigestWindow(
  messages: DigestWindowMessage[],
  source: ConversationSource = "whatsapp",
): DigestWindow {
  if (messages.length === 0) {
    throw new Error("Digest windows require at least one message.");
  }
  const ordered = [...messages].sort((a, b) =>
    a.happenedAt.localeCompare(b.happenedAt),
  );
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  return {
    contactId: first.contactId,
    source,
    windowStart: first.happenedAt,
    windowEnd: last.happenedAt,
    firstMessageId: first.id,
    lastMessageId: last.id,
    sourceMessageCount: ordered.length,
    contentHash: buildDigestContentHash(ordered.map((message) => message.id)),
    transcript: ordered
      .map((message) => `${message.id}: ${message.body}`)
      .join("\n"),
  };
}

export type ConversationDigestProcessSummary = {
  processedWindows: number;
  digestsCreated: number;
  factsCreated: number;
  embeddingsCreated: number;
};

type DigestWindowWorkItem = {
  window: DigestWindow;
  messages: DigestWindowMessage[];
};

function splitMessagesIntoDigestWindows(
  messages: DigestWindowMessage[],
): DigestWindowWorkItem[] {
  const byContact = new Map<string, DigestWindowMessage[]>();
  for (const message of messages) {
    const bucket = byContact.get(message.contactId);
    if (bucket) bucket.push(message);
    else byContact.set(message.contactId, [message]);
  }

  const windows: DigestWindowWorkItem[] = [];
  for (const contactMessages of byContact.values()) {
    const ordered = [...contactMessages].sort((a, b) =>
      a.happenedAt.localeCompare(b.happenedAt),
    );
    let current: DigestWindowMessage[] = [];
    let previousTime: number | null = null;

    for (const message of ordered) {
      const currentTime = Date.parse(message.happenedAt);
      const startsNewWindow =
        current.length > 0 &&
        previousTime !== null &&
        Number.isFinite(currentTime) &&
        currentTime - previousTime > DIGEST_WINDOW_SESSION_GAP_MS;

      if (startsNewWindow) {
        windows.push({
          window: buildDigestWindow(current),
          messages: current,
        });
        current = [];
      }

      current.push(message);
      previousTime = currentTime;
    }

    if (current.length > 0) {
      windows.push({
        window: buildDigestWindow(current),
        messages: current,
      });
    }
  }

  return windows;
}

export async function processConversationDigestWindows(input?: {
  limit?: number;
}): Promise<ConversationDigestProcessSummary> {
  const messages = await listConversationMessagesForDigest({
    limit: input?.limit ?? 500,
  });
  const windows = splitMessagesIntoDigestWindows(messages);
  const summary: ConversationDigestProcessSummary = {
    processedWindows: 0,
    digestsCreated: 0,
    factsCreated: 0,
    embeddingsCreated: 0,
  };

  for (const item of windows) {
    const { window, messages: windowMessages } = item;
    if (await conversationDigestExists(window.contentHash)) continue;

    const extraction = await extractConversationDigest({
      transcript: window.transcript,
    });

    await upsertConversationDigest({
      contactId: window.contactId,
      source: window.source,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      firstMessageId: window.firstMessageId,
      lastMessageId: window.lastMessageId,
      summary: extraction.summary,
      sourceMessageCount: window.sourceMessageCount,
      contentHash: window.contentHash,
      generatorModel: extraction.model,
      generatorVersion: DIGEST_GENERATOR_VERSION,
    });

    const sourceMessageIds = windowMessages.map((message) => message.id);
    const facts = buildConversationFactInputs({
      contactId: window.contactId,
      sourceMessageIds,
      observedAt: window.windowEnd,
      extractorModel: extraction.model,
      facts: extraction.facts,
    });
    await appendConversationFacts(facts);

    const embeddingResult = await buildConversationEmbeddingRows({
      messages: windowMessages.map((message) => ({
        id: message.id,
        body: message.body,
      })),
    });
    await upsertConversationEmbeddings(embeddingResult.rows);

    summary.processedWindows += 1;
    summary.digestsCreated += 1;
    summary.factsCreated += facts.length;
    summary.embeddingsCreated += embeddingResult.rows.length;
  }

  return summary;
}
