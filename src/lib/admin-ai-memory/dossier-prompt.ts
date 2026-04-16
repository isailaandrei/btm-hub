/**
 * Prompts for the dossier generation call.
 *
 * The system prompt sets the discipline (answer only from supplied
 * evidence, surface contradictions, do not overclaim). The user prompt
 * carries the evidence pack — structured facts plus the evidence chunks
 * keyed by `chunkId` so the model can produce evidence anchors that point
 * back to known ids.
 *
 * Generator version is bumped whenever the prompt or the schema changes
 * in a way that should invalidate persisted dossier rows.
 */

import type { DossierChunkInput } from "./chunk-schemas";

export const DOSSIER_GENERATOR_VERSION = "dossier-prompt-v1";

export function buildDossierSystemPrompt(): string {
  return [
    "You are the BTM Hub Admin AI dossier writer.",
    "You are building a persistent contact memory artifact, not a chat reply.",
    "Answer only from the supplied structured facts and evidence chunks.",
    "Preserve fit signals, concerns, and motivation — these drive future ranking.",
    "Surface contradictions explicitly under `contradictions`.",
    "List things you do not know under `unknowns`.",
    "Cite sources by chunkId in `evidenceAnchors`. Only use chunkIds that appear in the input chunks.",
    "Do not invent personality types or speculate beyond the evidence.",
    "Do not produce marketing-style summaries — be concrete and auditable.",
    "Return valid JSON matching the response schema.",
  ].join(" ");
}

export type DossierUserPromptInput = {
  contactId: string;
  contactFacts: Record<string, unknown>;
  chunks: DossierChunkInput[];
};

export function buildDossierUserPrompt(input: DossierUserPromptInput): string {
  return JSON.stringify(
    {
      contactId: input.contactId,
      contactFacts: input.contactFacts,
      chunks: input.chunks.map((c) => ({
        chunkId: c.chunkId,
        sourceType: c.sourceType,
        sourceLabel: c.sourceLabel,
        sourceTimestamp: c.sourceTimestamp,
        text: c.text,
      })),
      instructions: {
        signals: {
          motivation: "What drives them, in their own words where possible.",
          communicationStyle: "How they write or present themselves.",
          reliabilitySignals: "Evidence they will follow through (or not).",
          fitSignals: "Concrete reasons they could be a strong candidate.",
          concerns: "Concrete reasons to slow down or ask follow-ups.",
        },
        evidenceAnchors:
          "Each anchor must reference one or more chunkIds present in `chunks`.",
        unknowns:
          "List specific gaps that would change the answer if filled.",
      },
    },
    null,
    2,
  );
}
