/**
 * Structured-output schema for the dossier generation call.
 *
 * Two layers:
 *   1. `dossierResultSchema` — strict Zod parser used after the model
 *      returns. This is what we trust before persisting to
 *      `crm_ai_contact_dossiers`.
 *   2. `DOSSIER_RESPONSE_JSON_SCHEMA` — the JSON Schema we hand to the
 *      OpenAI Responses API so the provider returns a payload that
 *      conforms to (1) without a roundtrip retry loop.
 *
 * Both layers must stay in sync. If you add a section to one, add it to
 * the other.
 */

import { z } from "zod/v4";

const confidenceEnum = z.enum(["high", "medium", "low"]);

const signalEntrySchema = z.object({
  value: z.string().min(1),
  confidence: confidenceEnum,
});

const signalsSchema = z.object({
  motivation: z.array(signalEntrySchema),
  communicationStyle: z.array(signalEntrySchema),
  reliabilitySignals: z.array(signalEntrySchema),
  fitSignals: z.array(signalEntrySchema),
  concerns: z.array(signalEntrySchema),
});

/**
 * Chunk ids in evidence anchors must be prompt-local labels we handed to
 * the model (e.g. `chunk_1`, `chunk_2`). Rejecting anything else at the
 * schema boundary catches model hallucinations like `facts`, `summary`,
 * `chunk_`, or partial labels early — before the id-remap throws a less
 * informative error downstream.
 */
const CHUNK_ID_PATTERN = /^chunk_[1-9][0-9]*$/;
const CHUNK_ID_PATTERN_SOURCE = "^chunk_[1-9][0-9]*$";

const evidenceAnchorSchema = z.object({
  claim: z.string().min(1),
  chunkIds: z.array(
    z.string().regex(CHUNK_ID_PATTERN, {
      message: `chunkId must match ${CHUNK_ID_PATTERN_SOURCE}`,
    }),
  ),
  confidence: confidenceEnum,
});

const summarySchema = z.object({
  short: z.string().min(1),
  medium: z.string().min(1),
});

/**
 * Top-level dossier schema. The `superRefine` enforces a "summary cannot be
 * the only signal carrier" rule: we want at least one of signals, evidence
 * anchors, contradictions, or unknowns to also carry usable content. A
 * summary by itself isn't auditable.
 */
export const dossierResultSchema = z
  .object({
    signals: signalsSchema,
    contradictions: z.array(z.string()),
    unknowns: z.array(z.string()),
    evidenceAnchors: z.array(evidenceAnchorSchema),
    summary: summarySchema,
    confidence: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const hasSignal = Object.values(data.signals).some(
      (entries) => entries.length > 0,
    );
    const hasContent =
      hasSignal ||
      data.contradictions.length > 0 ||
      data.unknowns.length > 0 ||
      data.evidenceAnchors.length > 0;
    if (!hasContent) {
      ctx.addIssue({
        code: "custom",
        message:
          "summary cannot be the only signal carrier — populate signals, evidence anchors, contradictions, or unknowns",
      });
    }
  });

export type DossierResult = z.infer<typeof dossierResultSchema>;

// ---------------------------------------------------------------------------
// JSON Schema for OpenAI structured outputs
// ---------------------------------------------------------------------------

const signalEntryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    confidence: { enum: ["high", "medium", "low"] },
  },
  required: ["value", "confidence"],
} as const;

export const DOSSIER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    signals: {
      type: "object",
      additionalProperties: false,
      properties: {
        motivation: { type: "array", items: signalEntryJsonSchema },
        communicationStyle: { type: "array", items: signalEntryJsonSchema },
        reliabilitySignals: { type: "array", items: signalEntryJsonSchema },
        fitSignals: { type: "array", items: signalEntryJsonSchema },
        concerns: { type: "array", items: signalEntryJsonSchema },
      },
      required: [
        "motivation",
        "communicationStyle",
        "reliabilitySignals",
        "fitSignals",
        "concerns",
      ],
    },
    contradictions: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    evidenceAnchors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          chunkIds: {
            type: "array",
            items: { type: "string", pattern: CHUNK_ID_PATTERN_SOURCE },
          },
          confidence: { enum: ["high", "medium", "low"] },
        },
        required: ["claim", "chunkIds", "confidence"],
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        short: { type: "string" },
        medium: { type: "string" },
      },
      required: ["short", "medium"],
    },
  },
  required: [
    "signals",
    "contradictions",
    "unknowns",
    "evidenceAnchors",
    "summary",
  ],
} as const;
