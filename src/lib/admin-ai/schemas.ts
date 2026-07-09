/**
 * Zod schemas for the admin AI analyst feature.
 *
 * These schemas back the server action input validation, the query planner
 * output contract, and the LLM response contract. They mirror the
 * TypeScript types in `src/types/admin-ai.ts` — keep them in sync.
 */

import { z } from "zod/v4";

import { isUUID } from "@/lib/validation-helpers";
import {
  ADMIN_AI_STRUCTURED_FIELDS,
  isAdminAiStructuredField,
} from "./field-config";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

// Use the repo-wide UUID helper instead of `z.uuid()`. Zod v4 only accepts
// canonical RFC variant UUIDs, while our local/dev seed data uses stable
// UUID-shaped identifiers that are accepted across the rest of the app.
const uuidSchema = z.string().refine(isUUID, {
  message: "Invalid UUID",
});

const adminAiScopeSchema = z.enum(["global", "contact"]);

const adminAiModeSchema = z.enum([
  "global_search",
  "contact_synthesis",
]);

const adminAiFilterOpSchema = z.enum(["eq", "in", "contains"]);

/**
 * Structured filter field enum. We derive it from the runtime
 * `ADMIN_AI_STRUCTURED_FIELDS` allowlist so adding a curated column to the
 * registry automatically extends the schema. Using `refine` (rather than
 * `z.enum(...)`) keeps the schema well-typed even when the allowlist is
 * exposed as `readonly string[]`.
 */
const adminAiStructuredFieldSchema = z
  .string()
  .refine(isAdminAiStructuredField, {
    message: "Field is not in the admin AI structured allowlist",
  });

// ---------------------------------------------------------------------------
// Server action input schemas
// ---------------------------------------------------------------------------

/** Input payload for the `askAdminAiQuestion` server action. */
export const adminAiAskInputSchema = z
  .object({
    scope: adminAiScopeSchema,
    question: z
      .string()
      .trim()
      .min(1, "Question is required")
      .max(2000, "Question is too long (max 2000 characters)"),
    threadId: uuidSchema.optional(),
    contactId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "contact" && !value.contactId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactId"],
        message: "contactId is required when scope is 'contact'",
      });
    }
  });

export type AdminAiAskInput = z.infer<typeof adminAiAskInputSchema>;

/** Input payload for loading a single thread (messages + citations). */
export const adminAiThreadLoadSchema = z.object({
  threadId: uuidSchema,
});

export type AdminAiThreadLoadInput = z.infer<typeof adminAiThreadLoadSchema>;

/** Input payload for mutating a thread (rename / delete). */
export const adminAiThreadMutationSchema = z.object({
  threadId: uuidSchema,
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title is too long (max 200 characters)")
    .optional(),
});

export type AdminAiThreadMutationInput = z.infer<
  typeof adminAiThreadMutationSchema
>;

// ---------------------------------------------------------------------------
// Query plan schema
// ---------------------------------------------------------------------------

const adminAiStructuredFilterSchema = z.object({
  field: adminAiStructuredFieldSchema,
  op: adminAiFilterOpSchema,
  value: z.union([z.string(), z.array(z.string())]),
});

/**
 * Schema for `AdminAiQueryPlan`. Enforces that `contactId` is present
 * whenever the mode is `contact_synthesis`, matching the runtime planner
 * invariant.
 */
export const adminAiQueryPlanSchema = z
  .object({
    mode: adminAiModeSchema,
    contactId: uuidSchema.optional(),
    structuredFilters: z.array(adminAiStructuredFilterSchema),
    textFocus: z.array(z.string().trim().min(1)),
    requestedLimit: z.number().int().positive().optional(),
  })
  .superRefine((plan, ctx) => {
    if (plan.mode === "contact_synthesis" && !plan.contactId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactId"],
        message: "contactId is required when mode is 'contact_synthesis'",
      });
    }
  });

// ---------------------------------------------------------------------------
// Response schema
// ---------------------------------------------------------------------------

const adminAiCitationSchema = z.object({
  evidenceId: z.string().min(1),
  claimKey: z.string().min(1),
});

// `matchStrength` is required in the model contract; `.default(0)` keeps
// pre-normalization test fixtures (and any model that omits it) parseable while
// still enforcing the 0-100 bound when present. The orchestrator sorts by it.
const matchStrengthSchema = z.number().int().min(0).max(100).default(0);

// contactId is a non-empty string, NOT a strict UUID: models garble/fabricate
// 36-char UUIDs when enumerating 80+ contacts. A dedicated post-parse
// id-integrity repair layer resolves or drops bad ids without failing the parse.
const adminAiShortlistEntrySchema = z.object({
  contactId: z.string().min(1),
  contactName: z.string(),
  whyFit: z.array(z.string()),
  concerns: z.array(z.string()),
  citations: z.array(adminAiCitationSchema),
  matchStrength: matchStrengthSchema,
});

const adminAiContactAssessmentSchema = z.object({
  inferredQualities: z.array(z.string()),
  concerns: z.array(z.string()),
  citations: z.array(adminAiCitationSchema),
});

const adminAiAdditionalMatchSchema = z.object({
  contactId: z.string().min(1),
  contactName: z.string(),
  reason: z.string(),
  matchStrength: matchStrengthSchema,
});

/** Schema for `AdminAiResponse` — the structured LLM output. */
export const adminAiResponseSchema = z.object({
  // Normalized to `[]` when absent; empty is only correct for factual questions.
  assumptions: z.array(z.string()).default([]),
  shortlist: z.array(adminAiShortlistEntrySchema).optional(),
  additionalMatches: z.array(adminAiAdditionalMatchSchema).optional(),
  contactAssessment: adminAiContactAssessmentSchema.optional(),
  uncertainty: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Constraint planner schema
// ---------------------------------------------------------------------------

/**
 * Output of the constraint planner: only constraints the question makes explicit
 * and exclusionary. Tolerant defaults keep a partial object parseable; the caller
 * validates every name against the live catalog and falls back to the legacy
 * deterministic filters on any failure (the single sanctioned degraded mode).
 */
export const plannerOutputSchema = z.object({
  tagConstraint: z
    .object({
      category: z.string(),
      includeStatuses: z.array(z.string()),
    })
    .nullable()
    .default(null),
  budgetMin: z.number().nullable().default(null),
  fieldConstraints: z
    .array(
      z.object({
        field: z.string(),
        op: z.enum(["contains", "eq"]),
        value: z.string(),
      }),
    )
    .default([]),
  // True when the question is a pure roster of the extracted constraints; the
  // orchestrator then guarantees every prefiltered member appears in the answer.
  enumerationOnly: z.boolean().default(false),
  notes: z.string().default(""),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// ---------------------------------------------------------------------------
// Map-scan extraction schema
// ---------------------------------------------------------------------------

/**
 * Per-chunk extraction contract for the map stage of the map-reduce scan. Each
 * candidate names a contact whose card holds evidence plausibly relevant to the
 * question, with the decisive evidence quoted for the reduce stage.
 */
export const mapExtractionSchema = z.object({
  candidates: z.array(
    z.object({
      contactId: uuidSchema,
      contactName: z.string(),
      evidenceSummary: z.string(),
      // strong = the quoted evidence DIRECTLY satisfies the question's core
      // criterion; weak = real quotable evidence whose relevance is partial or
      // uncertain. Defaults to "strong" when the model omits it (inclusion-safe:
      // an ungraded candidate is never trimmed by the reduce cap). The map-scan
      // caller logs the omission for calibration; it never fails the parse.
      strength: z.enum(["strong", "weak"]).default("strong"),
    }),
  ),
  // Emitted ONLY when a chunk has zero full matches and the question states a
  // rare/specific/multi-part criterion: contacts with real PARTIAL evidence,
  // each naming the aspect they do NOT satisfy. Empty for normal questions.
  nearMisses: z
    .array(
      z.object({
        contactId: uuidSchema,
        contactName: z.string(),
        evidenceSummary: z.string(),
        missingAspect: z.string(),
      }),
    )
    .max(3)
    .default([]),
});

export type MapExtraction = z.infer<typeof mapExtractionSchema>;

// Re-export the structured allowlist for convenience so consumers of the
// schemas can reason about which fields are accepted without importing
// `field-config.ts` separately.
export { ADMIN_AI_STRUCTURED_FIELDS };
