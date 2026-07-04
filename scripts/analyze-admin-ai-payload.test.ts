/**
 * Offline admin-AI payload analyzer (dev only — not a real test).
 *
 * Reproduces the EXACT request the admin AI builds — using the real card
 * renderer and prompt builders — against the live DB in .env.development.local,
 * then prints an exact token/segment/cache-split breakdown for both scopes.
 *
 * Run:  RUN_ADMIN_AI_ANALYSIS=1 npx vitest run scripts/analyze-admin-ai-payload.test.ts
 *
 * Gated behind RUN_ADMIN_AI_ANALYSIS so the normal `npm run test:unit` suite
 * never runs it (it hits the network / production data). Vitest is used only as
 * a reliable TS+alias runner; tsx is broken under this machine's Node 26. The
 * prod-DB loader + renderer live in scripts/admin-ai-live-lib.ts.
 */
import { describe, it } from "vitest";
import {
  createLiveSupabaseClient,
  loadEligible,
  loadEnv,
  renderRecordsForLive,
} from "./admin-ai-live-lib";
import type { RenderedContactCard } from "@/lib/admin-ai/contact-card";
import {
  buildAdminAiResponseJsonSchema,
  buildAdminAiSystemPrompt,
  buildAdminAiUserPrompt,
} from "@/lib/admin-ai/prompt";
import {
  formatAdminAiPayloadReport,
  inspectAdminAiPayload,
} from "@/lib/admin-ai/payload-inspect";
import type { ContactCardRecord } from "@/lib/data/contact-cards";
import type { AdminAiQueryPlan, AdminAiScope } from "@/types/admin-ai";

const SAMPLE_QUESTION =
  "Which candidates are the strongest fits for our freediving instructor program?";

function makeQueryPlan(scope: AdminAiScope, question: string, contactId?: string): AdminAiQueryPlan {
  return {
    mode: scope === "contact" ? "contact_synthesis" : "global_search",
    contactId: scope === "contact" ? contactId : undefined,
    structuredFilters: [],
    textFocus: question.trim() ? [question.trim()] : [],
    requestedLimit: scope === "contact" ? 1 : 25,
  };
}

describe.runIf(process.env.RUN_ADMIN_AI_ANALYSIS === "1")("admin-ai payload analysis", () => {
  it("prints exact token/segment/cache breakdown for global + contact scope", async () => {
    const env = loadEnv(".env.development.local");
    const includeEvidence = ["1", "true", "yes", "on"].includes(
      (env.ADMIN_AI_INCLUDE_EVIDENCE ?? "").toLowerCase(),
    );
    const model = env.OPENAI_MODEL || "gpt-5.4";
    const supabase = createLiveSupabaseClient(env);

    const render = (records: ContactCardRecord[]): RenderedContactCard[] =>
      renderRecordsForLive(records, { includeEvidence });

    const report = (scope: AdminAiScope, cards: RenderedContactCard[], question: string, contactId?: string) => {
      const systemPrompt = buildAdminAiSystemPrompt(scope, { includeEvidence });
      const userPrompt = buildAdminAiUserPrompt({
        question, scope, queryPlan: makeQueryPlan(scope, question, contactId),
        cards, evidence: [], includeEvidence,
      });
      const schema = buildAdminAiResponseJsonSchema({ includeEvidence });
      const inspection = inspectAdminAiPayload({
        model, scope, includeEvidence, systemPrompt, userPrompt, schema,
      });
      console.info(formatAdminAiPayloadReport(inspection));
    };

    console.info(`\nDB=${env.NEXT_PUBLIC_SUPABASE_URL}  model=${model}  includeEvidence=${includeEvidence}\n`);

    const records = await loadEligible(supabase);
    const globalCards = render(records);
    console.info("\n########## GLOBAL SCOPE (full eligible cohort) ##########");
    report("global", globalCards, SAMPLE_QUESTION);

    const heaviest = [...globalCards].sort((a, b) => b.text.length - a.text.length)[0];
    if (heaviest) {
      const rec = records.find((r) => r.contact.id === heaviest.contactId)!;
      console.info(`\n########## CONTACT SCOPE (heaviest card: ${heaviest.contactName}) ##########`);
      report("contact", render([rec]), "Summarize this contact's fit and any concerns.", heaviest.contactId);
    }

    const appCount = records.reduce((n, r) => n + r.applications.length, 0);
    console.info(`\nCohort: ${records.length} contacts · ${appCount} applications\n`);
  }, 180_000);
});
