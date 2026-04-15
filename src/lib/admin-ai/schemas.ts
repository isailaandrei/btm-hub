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
  "hybrid",
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
    requestedLimit: z.number().int().nonnegative(),
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

const adminAiShortlistEntrySchema = z.object({
  contactId: uuidSchema,
  contactName: z.string(),
  whyFit: z.array(z.string()),
  concerns: z.array(z.string()),
  citations: z.array(adminAiCitationSchema),
});

const adminAiContactAssessmentSchema = z.object({
  facts: z.array(z.string()),
  inferredQualities: z.array(z.string()),
  concerns: z.array(z.string()),
  citations: z.array(adminAiCitationSchema),
});

/** Schema for `AdminAiResponse` — the structured LLM output. */
export const adminAiResponseSchema = z.object({
  summary: z.string(),
  keyFindings: z.array(z.string()),
  shortlist: z.array(adminAiShortlistEntrySchema).optional(),
  contactAssessment: adminAiContactAssessmentSchema.optional(),
  uncertainty: z.array(z.string()),
});

// Re-export the structured allowlist for convenience so consumers of the
// schemas can reason about which fields are accepted without importing
// `field-config.ts` separately.
export { ADMIN_AI_STRUCTURED_FIELDS };
