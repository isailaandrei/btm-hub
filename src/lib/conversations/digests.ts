import { createHash } from "node:crypto";
import {
  appendConversationFacts,
  conversationDigestExists,
  listMessagesMissingEmbeddings,
  listUndigestedConversationMessages,
  upsertConversationDigest,
  upsertConversationEmbeddings,
} from "@/lib/data/conversations";
import { extractConversationDigest } from "./digest-provider";
import {
  buildConversationEmbeddingRows,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MESSAGE_EMBEDDING_VERSION,
} from "./embeddings";
import { buildConversationFactInputs } from "./facts";
import type { ConversationDirection, ConversationSource } from "./ingestion/adapter";

export const DIGEST_GENERATOR_VERSION = "conversation-digest-v1";
export const DIGEST_WINDOW_SESSION_GAP_MS = 30 * 60 * 1000;

export type DigestWindowMessage = {
  id: string;
  contactId: string;
  direction: ConversationDirection;
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

function formatTranscriptLine(message: DigestWindowMessage): string {
  return `${message.happenedAt} ${message.direction} ${message.id}: ${message.body}`;
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
      .map(formatTranscriptLine)
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
  now: number,
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
        if (isDigestWindowClosed(current, now)) {
          windows.push({
            window: buildDigestWindow(current),
            messages: current,
          });
        }
        current = [];
      }

      current.push(message);
      previousTime = currentTime;
    }

    if (current.length > 0 && isDigestWindowClosed(current, now)) {
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
  embeddingLimit?: number;
  now?: number;
}): Promise<ConversationDigestProcessSummary> {
  const now = input?.now ?? Date.now();
  const messages = await listUndigestedConversationMessages({
    limit: input?.limit ?? 500,
  });
  const windows = splitMessagesIntoDigestWindows(messages, now);
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

    summary.processedWindows += 1;
    summary.digestsCreated += 1;
    summary.factsCreated += facts.length;
  }

  const messagesMissingEmbeddings = await listMessagesMissingEmbeddings({
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingVersion: DEFAULT_MESSAGE_EMBEDDING_VERSION,
    limit: input?.embeddingLimit ?? 500,
  });
  const embeddingResult = await buildConversationEmbeddingRows({
    messages: messagesMissingEmbeddings,
    model: DEFAULT_EMBEDDING_MODEL,
    version: DEFAULT_MESSAGE_EMBEDDING_VERSION,
  });
  await upsertConversationEmbeddings(embeddingResult.rows);
  summary.embeddingsCreated = embeddingResult.rows.length;

  return summary;
}

function isDigestWindowClosed(
  messages: DigestWindowMessage[],
  now: number,
): boolean {
  const last = [...messages].sort((a, b) =>
    a.happenedAt.localeCompare(b.happenedAt),
  ).at(-1);
  if (!last) return false;
  const windowEnd = Date.parse(last.happenedAt);
  return Number.isFinite(windowEnd) && windowEnd < now - DIGEST_WINDOW_SESSION_GAP_MS;
}
