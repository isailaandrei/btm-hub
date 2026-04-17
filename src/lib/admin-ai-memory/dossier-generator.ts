/**
 * Dossier generation entry point.
 *
 * Wraps the OpenAI Responses API for the dossier-specific call. Kept
 * intentionally separate from `src/lib/admin-ai/provider.ts` so the
 * dossier prompt + schema do not couple to the answer-time provider
 * surface. They share configuration semantics (env vars, JSON schema mode)
 * but neither calls the other.
 *
 * Retry posture:
 *   - Malformed chunk-id anchors (Zod regex fail) or unknown chunk-id
 *     anchors (remap miss) trigger ONE repair retry with a stricter
 *     system prompt that enumerates the valid labels. This catches the
 *     common model failure mode without spinning on deterministic bugs.
 *   - Timeouts, HTTP errors, and refusals are NOT retried here.
 */

import { ZodError } from "zod/v4";
import {
  DOSSIER_RESPONSE_JSON_SCHEMA,
  dossierResultSchema,
  type DossierResult,
} from "./dossier-schema";
import {
  DOSSIER_GENERATOR_VERSION,
  buildDossierRepairSystemPrompt,
  buildDossierSystemPrompt,
  buildDossierUserPrompt,
} from "./dossier-prompt";
import type { DossierChunkInput } from "./chunk-schemas";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
// Reasoning models (gpt-5 / o-series) emit internal reasoning tokens before
// the structured output, which can blow through a 60s wall-clock timeout
// even on small prompts. 120s gives them room; non-reasoning models still
// finish well under that.
const OPENAI_REQUEST_TIMEOUT_MS = 120_000;

export type DossierGenerationInput = {
  contactId: string;
  contactFacts: Record<string, unknown>;
  chunks: DossierChunkInput[];
};

export type DossierGenerationResult = {
  dossier: DossierResult;
  generatorVersion: string;
  modelMetadata: {
    provider: "openai";
    model: string;
    responseId: string | null;
    usage: Record<string, unknown> | null;
    repairAttempted?: boolean;
  };
};

type PromptChunkRef = DossierChunkInput & {
  stableChunkId: string;
};

type OpenAiResponseItem = {
  type?: string;
  content?: Array<
    | { type?: "output_text"; text?: string }
    | { type?: "refusal"; refusal?: string }
  >;
};

type OpenAiResponsesPayload = {
  id?: string;
  model?: string;
  output?: OpenAiResponseItem[];
  usage?: Record<string, unknown>;
};

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getDossierModel(): string {
  return (
    process.env.OPENAI_DOSSIER_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL
  );
}

function extractResponseText(payload: OpenAiResponsesPayload): string {
  const textParts: string[] = [];
  const refusalParts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        textParts.push(content.text);
      } else if (
        content.type === "refusal" &&
        typeof content.refusal === "string"
      ) {
        refusalParts.push(content.refusal);
      }
    }
  }
  if (textParts.length > 0) return textParts.join("\n");
  if (refusalParts.length > 0) {
    throw new Error(
      `Dossier model refused structured response: ${refusalParts.join(" ")}`,
    );
  }
  throw new Error("Dossier provider returned no structured response text");
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? response.statusText;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

function buildPromptChunkRefs(chunks: DossierChunkInput[]): PromptChunkRef[] {
  return chunks.map((chunk, index) => ({
    ...chunk,
    stableChunkId: chunk.chunkId,
    chunkId: `chunk_${index + 1}`,
  }));
}

class UnknownAnchorChunkIdError extends Error {
  constructor(public readonly chunkId: string) {
    super(`Dossier referenced unknown chunkId in evidence anchor: ${chunkId}`);
    this.name = "UnknownAnchorChunkIdError";
  }
}

async function callDossierApi(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<OpenAiResponsesPayload> {
  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        input: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "admin_ai_dossier",
            strict: true,
            schema: DOSSIER_RESPONSE_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `OpenAI dossier request timed out after ${OPENAI_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  }

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(`OpenAI dossier request failed: ${message}`);
  }

  return (await response.json()) as OpenAiResponsesPayload;
}

function parseAndValidate(
  payload: OpenAiResponsesPayload,
  promptChunks: PromptChunkRef[],
): DossierResult {
  const rawText = extractResponseText(payload);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Dossier response is not valid JSON: ${message}`);
  }

  const dossier = dossierResultSchema.parse(parsedJson);

  // Remap prompt-local labels back to stable chunk ids. Unknown labels
  // at this point mean the model returned something like `chunk_99` when
  // we only handed it `chunk_1..chunk_5` — caught here and handled as a
  // repair-eligible error by the caller.
  const promptToStableChunkId = new Map(
    promptChunks.map((chunk) => [chunk.chunkId, chunk.stableChunkId]),
  );
  for (const anchor of dossier.evidenceAnchors) {
    anchor.chunkIds = anchor.chunkIds.map((id) => {
      const stableId = promptToStableChunkId.get(id);
      if (!stableId) {
        throw new UnknownAnchorChunkIdError(id);
      }
      return stableId;
    });
  }

  return dossier;
}

function isRepairableError(error: unknown): boolean {
  if (error instanceof UnknownAnchorChunkIdError) return true;
  if (error instanceof ZodError) {
    // Only treat the chunkIds regex failure as repair-eligible. Other
    // Zod failures (missing sections, wrong types) mean the model is
    // off-contract in a way a repair retry won't fix.
    return error.issues.some(
      (issue) =>
        issue.path.some(
          (segment) => segment === "chunkIds",
        ) ||
        issue.path.includes("evidenceAnchors"),
    );
  }
  return false;
}

export async function generateContactDossier(
  input: DossierGenerationInput,
): Promise<DossierGenerationResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Dossier generator is not configured (missing OPENAI_API_KEY).");
  }
  const model = getDossierModel();
  const promptChunks = buildPromptChunkRefs(input.chunks);
  const userPrompt = buildDossierUserPrompt({
    ...input,
    chunks: promptChunks,
  });

  let payload: OpenAiResponsesPayload;
  let dossier: DossierResult;
  let repairAttempted = false;

  try {
    payload = await callDossierApi({
      apiKey,
      model,
      systemPrompt: buildDossierSystemPrompt(),
      userPrompt,
    });
    dossier = parseAndValidate(payload, promptChunks);
  } catch (error) {
    if (!isRepairableError(error)) throw error;

    repairAttempted = true;
    const previousError = error instanceof Error ? error.message : String(error);
    payload = await callDossierApi({
      apiKey,
      model,
      systemPrompt: buildDossierRepairSystemPrompt({
        validChunkIds: promptChunks.map((c) => c.chunkId),
        previousError,
      }),
      userPrompt,
    });
    // A second validation failure propagates — we only repair once.
    dossier = parseAndValidate(payload, promptChunks);
  }

  return {
    dossier,
    generatorVersion: DOSSIER_GENERATOR_VERSION,
    modelMetadata: {
      provider: "openai",
      model: payload.model ?? model,
      responseId: payload.id ?? null,
      usage: payload.usage ?? null,
      ...(repairAttempted ? { repairAttempted: true } : {}),
    },
  };
}
