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
    "PRESERVE SPECIFICS VERBATIM: organization names (e.g. National Geographic, BBC, UNESCO), publication titles, brand names, specific places, people's names, certifications, quantified claims (years of experience, dive depth, trip counts), and exact program references must appear literally in signals, summaries, or facts — not abstracted away. A future ranker may be asked 'who mentioned National Geographic?' and the dossier is the only place it can look; 'aspires to nature documentary work' is NOT the same as 'wants to work at National Geographic'.",
    "Surface contradictions explicitly under `contradictions`.",
    "List things you do not know under `unknowns`.",
    "Every evidence anchor MUST cite one or more prompt-local chunk labels that appear exactly in the `chunks` array — e.g. `chunk_1`, `chunk_2`.",
    "Do NOT invent labels like `facts`, `signals`, `summary`, `contact`, or return partial labels like `chunk_`. Valid labels match the pattern `chunk_<positive integer>`.",
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
          "Each anchor must reference one or more chunkIds copied verbatim from the `chunks` array above.",
        chunkIdRules: {
          valid: ["chunk_1", "chunk_2", "chunk_10"],
          invalid: ["chunk_", "facts", "signals", "summary", "1", ""],
          pattern: "^chunk_[1-9][0-9]*$",
        },
        unknowns:
          "List specific gaps that would change the answer if filled.",
      },
    },
    null,
    2,
  );
}

/**
 * Strict repair prompt used when the first dossier response contained
 * malformed or unknown chunk labels. Appends a hard instruction that
 * enumerates the only valid labels so the model has nothing to guess.
 */
export function buildDossierRepairSystemPrompt(input: {
  validChunkIds: string[];
  previousError: string;
}): string {
  return [
    buildDossierSystemPrompt(),
    "REPAIR MODE — your previous response was REJECTED because it used invalid chunk labels.",
    `Previous error: ${input.previousError}`,
    `The ONLY valid chunk labels for this contact are: ${input.validChunkIds.join(", ")}.`,
    "If an anchor cannot be supported by one of these labels, drop the anchor — do not invent labels.",
    "Copy the labels verbatim. Do not add quotes, backticks, or any other characters.",
  ].join(" ");
}
