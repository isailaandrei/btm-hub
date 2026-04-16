/**
 * Dossier generation entry point.
 *
 * Wraps the OpenAI Responses API for the dossier-specific call. Kept
 * intentionally separate from `src/lib/admin-ai/provider.ts` so the
 * dossier prompt + schema do not couple to the answer-time provider
 * surface. They share configuration semantics (env vars, JSON schema mode)
 * but neither calls the other.
 */

import {
  DOSSIER_RESPONSE_JSON_SCHEMA,
  dossierResultSchema,
  type DossierResult,
} from "./dossier-schema";
import {
  DOSSIER_GENERATOR_VERSION,
  buildDossierSystemPrompt,
  buildDossierUserPrompt,
} from "./dossier-prompt";
import type { DossierChunkInput } from "./chunk-schemas";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_REQUEST_TIMEOUT_MS = 60_000;

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

export async function generateContactDossier(
  input: DossierGenerationInput,
): Promise<DossierGenerationResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Dossier generator is not configured (missing OPENAI_API_KEY).");
  }
  const model = getDossierModel();
  const promptChunks = buildPromptChunkRefs(input.chunks);

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: buildDossierSystemPrompt() },
          {
            role: "user",
            content: buildDossierUserPrompt({
              ...input,
              chunks: promptChunks,
            }),
          },
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

  const payload = (await response.json()) as OpenAiResponsesPayload;
  const rawText = extractResponseText(payload);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Dossier response is not valid JSON: ${message}`);
  }

  const dossier = dossierResultSchema.parse(parsedJson);

  // Defense-in-depth: anchors must point to known chunk ids. The schema
  // can't enforce this on its own (it doesn't see the input chunk ids).
  const promptToStableChunkId = new Map(
    promptChunks.map((chunk) => [chunk.chunkId, chunk.stableChunkId]),
  );
  for (const anchor of dossier.evidenceAnchors) {
    anchor.chunkIds = anchor.chunkIds.map((id) => {
      const stableId = promptToStableChunkId.get(id);
      if (!stableId) {
        throw new Error(
          `Dossier referenced unknown chunkId in evidence anchor: ${id}`,
        );
      }
      return stableId;
    });
  }

  return {
    dossier,
    generatorVersion: DOSSIER_GENERATOR_VERSION,
    modelMetadata: {
      provider: "openai",
      model: payload.model ?? model,
      responseId: payload.id ?? null,
      usage: payload.usage ?? null,
    },
  };
}
