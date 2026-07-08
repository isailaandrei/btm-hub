/**
 * Per-contact AI summaries (task 1c) — a fixed question through the existing
 * CONTACT scope of the admin-AI pipeline (same card renderer, same provider,
 * same response contract), stored per contact and regenerated only when the
 * rendered card's content hash changes.
 *
 * Deliberate boundaries:
 * - Summaries NEVER enter the AI's own corpus (no AI-reading-AI loops).
 * - Eligibility = the same corpus the global AI reads (contacts with
 *   applications) — a contact invisible to the AI gets no summary.
 * - Bounded batches, drained across nightly cron runs / the gated backfill.
 */

import { createHash } from "node:crypto";
import { renderContactCard } from "./contact-card";
import { EvidenceAliasRegistry } from "./evidence-alias";
import { getAdminAiProvider } from "./provider";
import { adminAiResponseSchema } from "./schemas";
import {
  listContactAiSummaryHashes,
  upsertContactAiSummary,
} from "@/lib/data/contact-ai-summaries";
import {
  loadEligibleContactCardRecords,
  type ContactCardRecord,
} from "@/lib/data/contact-cards";
import type { AdminAiQueryPlan, AdminAiResponse } from "@/types/admin-ai";

export const DEFAULT_MAX_SUMMARIES_PER_RUN = 20;
const GENERATE_CONCURRENCY = 2;

// Bump to invalidate every stored summary (it participates in the content
// hash), e.g. after changing the question below.
export const CONTACT_SUMMARY_PROMPT_VERSION = "v1";

export const CONTACT_SUMMARY_QUESTION = [
  "Write a concise CRM summary of this contact for an admin preparing to",
  "interact with them: who they are and their background; which program(s)",
  "they are interested in and their current decision state (applied,",
  "committed, declined, paused — with dates where known); budget and",
  "practical constraints (availability, location, travel); relevant skills",
  "and equipment; relationship highlights from calls and messages (including",
  "tone); and the open questions an admin should resolve next. Ground every",
  "statement in the card evidence — do not infer beyond it, and omit topics",
  "with no evidence rather than speculating.",
].join(" ");

/** Hash of everything that determines a summary: card text + prompt version. */
export function buildContactCardHash(cardText: string): string {
  return createHash("sha256")
    .update(CONTACT_SUMMARY_PROMPT_VERSION)
    .update("\n")
    .update(cardText)
    .digest("hex");
}

function buildSummaryQueryPlan(contactId: string): AdminAiQueryPlan {
  // Mirrors the orchestrator's contact-scope plan (mode/limit), with the
  // fixed summary question as the text focus.
  return {
    mode: "contact_synthesis",
    contactId,
    structuredFilters: [],
    textFocus: [CONTACT_SUMMARY_QUESTION],
    requestedLimit: 1,
  };
}

/**
 * Renders the stored summary TEXT from the contact-scope response. The scope's
 * contract puts substance in `contactAssessment` (inferredQualities/concerns)
 * — NOT in `describeAssistantResponse`, which returns the literal placeholder
 * "Contact assessment returned." for this shape (it labels chat messages, it
 * doesn't render them). Caught in the Jul 7 staff review before any summary
 * was generated.
 */
export function renderContactSummaryText(response: AdminAiResponse): string {
  const assessment = response.contactAssessment;
  if (!assessment) {
    throw new Error("Contact summary response had no contactAssessment");
  }
  const sections: string[] = [];
  if (assessment.inferredQualities.length > 0) {
    sections.push(
      assessment.inferredQualities.map((quality) => `• ${quality}`).join("\n"),
    );
  }
  if (assessment.concerns.length > 0) {
    sections.push(
      `Concerns:\n${assessment.concerns.map((concern) => `• ${concern}`).join("\n")}`,
    );
  }
  if (response.uncertainty.length > 0) {
    sections.push(
      `Uncertainty:\n${response.uncertainty.map((item) => `• ${item}`).join("\n")}`,
    );
  }
  return sections.join("\n\n");
}

export interface ContactSummarySummaryRun {
  eligible: number;
  stale: number;
  generated: number;
  failed: number;
  remaining: number;
}

async function generateOne(record: ContactCardRecord): Promise<void> {
  const provider = getAdminAiProvider();
  const card = renderContactCard(record, new EvidenceAliasRegistry());
  const { response: rawResponse, modelMetadata } = await provider.generate({
    question: CONTACT_SUMMARY_QUESTION,
    scope: "contact",
    queryPlan: buildSummaryQueryPlan(record.contact.id),
    cards: [card],
    evidence: [],
    includeEvidence: false,
    promptCacheKey: null,
  });
  const response = adminAiResponseSchema.parse(rawResponse);
  const summary = renderContactSummaryText(response);
  if (!summary.trim()) {
    throw new Error(
      `Contact summary came back empty for ${record.contact.id} — refusing to store`,
    );
  }
  await upsertContactAiSummary({
    contactId: record.contact.id,
    summary,
    responseJson: response,
    cardContentHash: buildContactCardHash(card.text),
    model:
      typeof modelMetadata.model === "string"
        ? modelMetadata.model
        : (provider.getModel?.() ?? "unknown"),
  });
}

/**
 * Seed-and-drain: hash every eligible contact's rendered card (cheap, no
 * model calls), regenerate up to `maxContacts` stale/missing summaries, and
 * report what remains. Per-contact failures are counted and logged, never
 * silently skipped — and never abort the rest of the batch.
 */
export async function processContactAiSummaries(
  options: { maxContacts?: number } = {},
): Promise<ContactSummarySummaryRun> {
  const maxContacts = options.maxContacts ?? DEFAULT_MAX_SUMMARIES_PER_RUN;
  const provider = getAdminAiProvider();
  if (!provider.isConfigured()) {
    throw new Error(
      provider.getUnavailableReason() ??
        "Admin AI provider is not configured; cannot generate summaries",
    );
  }

  const [records, storedHashes] = await Promise.all([
    loadEligibleContactCardRecords(),
    listContactAiSummaryHashes(),
  ]);

  const stale = records.filter((record) => {
    const card = renderContactCard(record, new EvidenceAliasRegistry());
    return storedHashes.get(record.contact.id) !== buildContactCardHash(card.text);
  });

  const batch = stale.slice(0, maxContacts);
  let generated = 0;
  let failed = 0;
  for (let i = 0; i < batch.length; i += GENERATE_CONCURRENCY) {
    const chunk = batch.slice(i, i + GENERATE_CONCURRENCY);
    const outcomes = await Promise.allSettled(chunk.map(generateOne));
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === "fulfilled") {
        generated += 1;
      } else {
        failed += 1;
        console.error(
          `[contact-summary] generation failed for ${chunk[index]!.contact.id}:`,
          outcome.reason,
        );
      }
    }
  }

  return {
    eligible: records.length,
    stale: stale.length,
    generated,
    failed,
    remaining: stale.length - generated,
  };
}
