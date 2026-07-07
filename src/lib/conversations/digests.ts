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
  isEmbeddingConfigured,
} from "./embeddings";
import { buildConversationFactInputs } from "./facts";
import type { ConversationDirection, ConversationSource } from "./ingestion/adapter";

export const DIGEST_GENERATOR_VERSION = "conversation-digest-v1";
export const DIGEST_WINDOW_SESSION_GAP_MS = 30 * 60 * 1000;

// Per-invocation cap so a large backlog drains across cron runs rather than
// running to the function's max duration on the first call.
export const DEFAULT_MAX_DIGEST_WINDOWS_PER_RUN = 40;

// Below this total participant text (sum of trimmed message bodies), a window
// carries no CRM signal — greetings, media-only, empty — and is classified as
// noise WITHOUT a model call. Media-only windows (empty bodies) sum to 0.
export const NOISE_MIN_TOTAL_BODY_CHARS = 40;

// Marker stored as the generator model for code-level noise windows (no model
// was called), distinguishing them from model-classified noise.
const NOISE_GATE_MARKER = "noise-gate";

export function windowTotalBodyChars(messages: DigestWindowMessage[]): number {
  return messages.reduce((sum, message) => sum + message.body.trim().length, 0);
}

/** True when a window is trivially small / body-empty — noise without a model call. */
export function isTriviallyNoisyWindow(
  messages: DigestWindowMessage[],
): boolean {
  return windowTotalBodyChars(messages) < NOISE_MIN_TOTAL_BODY_CHARS;
}

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
  /** Windows classified noise (empty summary marker) — code-level or model-level. */
  noiseWindows: number;
  /** Quiesced windows this run did NOT process (cap hit / more batches remain). */
  remainingWindows: number;
  /** Messages left unembedded because OPENAI_API_KEY is not configured. */
  embeddingsSkipped: number;
};

export type DigestWindowWorkItem = {
  window: DigestWindow;
  messages: DigestWindowMessage[];
};

export function splitMessagesIntoDigestWindows(
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
  maxWindows?: number;
  now?: number;
}): Promise<ConversationDigestProcessSummary> {
  const now = input?.now ?? Date.now();
  const limit = input?.limit ?? 500;
  const maxWindows = input?.maxWindows ?? DEFAULT_MAX_DIGEST_WINDOWS_PER_RUN;
  const messages = await listUndigestedConversationMessages({ limit });
  // splitMessagesIntoDigestWindows only emits QUIESCED windows (last message
  // older than the session gap relative to `now`), so a still-live session is
  // never digested mid-flight.
  const windows = splitMessagesIntoDigestWindows(messages, now);
  const summary: ConversationDigestProcessSummary = {
    processedWindows: 0,
    digestsCreated: 0,
    factsCreated: 0,
    embeddingsCreated: 0,
    noiseWindows: 0,
    remainingWindows: 0,
    embeddingsSkipped: 0,
  };

  let index = 0;
  for (; index < windows.length; index += 1) {
    if (summary.processedWindows >= maxWindows) break;
    const { window, messages: windowMessages } = windows[index]!;
    if (await conversationDigestExists(window.contentHash)) continue;

    // Code-level noise gate: trivially small / body-empty windows are recorded
    // as noise markers (empty summary, is_noise = true) with NO model call, no
    // facts, and no per-window embeddings. The content hash still advances the
    // watermark so the window is never reprocessed.
    if (isTriviallyNoisyWindow(windowMessages)) {
      await upsertConversationDigest({
        contactId: window.contactId,
        source: window.source,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
        firstMessageId: window.firstMessageId,
        lastMessageId: window.lastMessageId,
        summary: "",
        sourceMessageCount: window.sourceMessageCount,
        contentHash: window.contentHash,
        generatorModel: NOISE_GATE_MARKER,
        generatorVersion: DIGEST_GENERATOR_VERSION,
        isNoise: true,
        relevance: null,
      });
      summary.processedWindows += 1;
      summary.noiseWindows += 1;
      continue;
    }

    const extraction = await extractConversationDigest({
      transcript: window.transcript,
    });
    // Model-level noise: an empty summary means the model found no signal — same
    // handling as the code-level gate (marker row, no facts).
    const isNoise = extraction.summary.trim() === "";
    const relevance = isNoise ? null : extraction.relevance;

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
      isNoise,
      relevance,
    });

    summary.processedWindows += 1;
    if (isNoise) {
      summary.noiseWindows += 1;
    } else {
      summary.digestsCreated += 1;
      // Facts are appended for ANY signal window (profile OR status), never for
      // noise. Durable-only is a PER-FACT decision the MODEL makes (the "facts
      // ONLY for PROFILE-grade content" prompt rule): a status-tagged window can
      // still carry a durable kernel — e.g. a dated attendance commitment whose
      // dominant content is logistics — and the window's relevance tag must not
      // veto the facts the model chose to emit.
      const facts = buildConversationFactInputs({
        contactId: window.contactId,
        sourceMessageIds: windowMessages.map((message) => message.id),
        observedAt: window.windowEnd,
        extractorModel: extraction.model,
        facts: extraction.facts,
      });
      await appendConversationFacts(facts);
      summary.factsCreated += facts.length;
    }
  }

  // Windows we did NOT reach this run (cap hit). Skipped-existing windows are
  // already done and don't count. If we cleared the whole batch but it filled
  // the fetch limit, more messages likely remain beyond it — signal one more run
  // (the next run advances the watermark and drains them).
  const unreached = windows.length - index;
  if (unreached > 0) {
    summary.remainingWindows = unreached;
  } else if (summary.processedWindows > 0 && messages.length >= limit) {
    summary.remainingWindows = 1;
  } else {
    summary.remainingWindows = 0;
  }

  // Embeddings backlog is independent of digest windows; bound it per run too.
  // Embeddings run on OpenAI (DeepSeek has no embedding endpoint). When no key
  // is configured, SKIP the pass with disclosure instead of throwing — a later
  // run with a key backfills automatically via listMessagesMissingEmbeddings
  // (this same query). A configured key that fails at request time still throws.
  const messagesMissingEmbeddings = await listMessagesMissingEmbeddings({
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingVersion: DEFAULT_MESSAGE_EMBEDDING_VERSION,
    limit: input?.embeddingLimit ?? 500,
  });
  if (!isEmbeddingConfigured()) {
    summary.embeddingsSkipped = messagesMissingEmbeddings.length;
    if (messagesMissingEmbeddings.length > 0) {
      console.warn(
        "[conversations] embeddings skipped: OPENAI_API_KEY not configured",
        { messagesLeftUnembedded: messagesMissingEmbeddings.length },
      );
    }
    return summary;
  }
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
