/**
 * WhatsApp phone-match backfill — a gated, live-DB maintenance run that re-links
 * unmatched WhatsApp messages to contacts using the robust digit-suffix matcher.
 *
 * Run (DRY RUN — reads only, writes a JSON report, no DB changes):
 *   RUN_WHATSAPP_MATCH_BACKFILL=1 npx vitest run scripts/whatsapp-match-backfill.test.ts
 *
 * Apply the matches (batched UPDATEs; only after auditing the dry-run report):
 *   RUN_WHATSAPP_MATCH_BACKFILL=1 BACKFILL_APPLY=1 npx vitest run scripts/whatsapp-match-backfill.test.ts
 *
 * Gated behind RUN_WHATSAPP_MATCH_BACKFILL so the normal suite never runs it.
 * Reads the service-role DB from `.env.development.local`. Never touches
 * already-matched or deactivated rows.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLiveSupabaseClient,
  loadEnv,
  type LiveSupabaseClient,
} from "./admin-ai-live-lib";
import {
  buildContactDigitIndex,
  matchContactByDigits,
} from "@/lib/conversations/phone";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

const gateEnabled = process.env.RUN_WHATSAPP_MATCH_BACKFILL === "1";
const applyMode = process.env.BACKFILL_APPLY === "1";

// Distinct marker so backfilled links are auditable/reversible separately from
// live webhook matches. Existing matched_via values are printed first so this
// stays consistent with their naming style.
const MATCHED_VIA_BACKFILL = "phone_backfill";
const UPDATE_BATCH_SIZE = 100;

type ContactRow = { id: string; name: string | null; phone: string | null };
type ApplicationRow = {
  id: string;
  contact_id: string | null;
  answers: Record<string, unknown> | null;
};
type UnmatchedRow = {
  id: string;
  direction: string;
  from_identifier: string | null;
  to_identifier: string | null;
};

type MatchProposal = {
  messageId: string;
  participant: string;
  contactId: string;
  contactName: string;
  matchedVia: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadDigitIndexRecords(
  supabase: LiveSupabaseClient,
): Promise<ContactCardRecord[]> {
  const [{ data: contacts, error: contactsError }, { data: apps, error: appsError }] =
    await Promise.all([
      supabase.from("contacts").select("id, name, phone"),
      supabase.from("applications").select("id, contact_id, answers"),
    ]);
  if (contactsError) throw new Error(contactsError.message);
  if (appsError) throw new Error(appsError.message);

  const appsByContact = new Map<
    string,
    Array<{ id: string; answers: Record<string, unknown> }>
  >();
  for (const app of (apps ?? []) as ApplicationRow[]) {
    if (!app.contact_id) continue;
    const bucket = appsByContact.get(app.contact_id) ?? [];
    bucket.push({ id: app.id, answers: app.answers ?? {} });
    appsByContact.set(app.contact_id, bucket);
  }

  return ((contacts ?? []) as ContactRow[]).map(
    (contact) =>
      ({
        contact: { id: contact.id, name: contact.name, phone: contact.phone },
        applications: appsByContact.get(contact.id) ?? [],
        contactNotes: [],
        contactTags: [],
      }) as unknown as ContactCardRecord,
  );
}

describe.runIf(gateEnabled)("whatsapp match backfill", () => {
  const env: Record<string, string> = (() => {
    try {
      return loadEnv(".env.development.local");
    } catch {
      return {};
    }
  })();

  it("proposes (and optionally applies) phone matches for unmatched messages", async () => {
    const supabase = createLiveSupabaseClient(env);

    const records = await loadDigitIndexRecords(supabase);
    const contactNameById = new Map(
      records.map((r) => [r.contact.id, r.contact.name ?? r.contact.id]),
    );
    const index = buildContactDigitIndex(records);

    // Existing matched_via naming style, for the operator to keep consistent.
    const { data: viaRows } = await supabase
      .from("conversation_messages")
      .select("matched_via")
      .eq("match_status", "matched")
      .not("matched_via", "is", null)
      .limit(2000);
    const existingMatchedVia = Array.from(
      new Set(
        ((viaRows ?? []) as Array<{ matched_via: string | null }>)
          .map((r) => r.matched_via)
          .filter((v): v is string => Boolean(v)),
      ),
    ).sort();

    const { data: unmatched, error: unmatchedError } = await supabase
      .from("conversation_messages")
      .select("id, direction, from_identifier, to_identifier")
      .eq("match_status", "unmatched")
      .is("deactivated_at", null)
      .limit(10000);
    if (unmatchedError) throw new Error(unmatchedError.message);

    const proposals: MatchProposal[] = [];
    let unmatchedCount = 0;
    for (const row of (unmatched ?? []) as UnmatchedRow[]) {
      unmatchedCount += 1;
      // Participant = sender for inbound, recipient for outbound.
      const participant =
        row.direction === "inbound" ? row.from_identifier : row.to_identifier;
      if (!participant) continue;
      const match = matchContactByDigits(index, participant);
      if (match.status === "matched") {
        proposals.push({
          messageId: row.id,
          participant,
          contactId: match.contactId,
          contactName: contactNameById.get(match.contactId) ?? match.contactId,
          matchedVia: match.matchedVia,
        });
      }
    }

    // Aggregate per participant → contact for the printed table.
    const byPair = new Map<
      string,
      { participant: string; contactId: string; contactName: string; count: number }
    >();
    for (const proposal of proposals) {
      const key = `${proposal.participant}${proposal.contactId}`;
      const existing = byPair.get(key) ?? {
        participant: proposal.participant,
        contactId: proposal.contactId,
        contactName: proposal.contactName,
        count: 0,
      };
      existing.count += 1;
      byPair.set(key, existing);
    }
    const pairs = [...byPair.values()].sort((a, b) => b.count - a.count);

    let applied = 0;
    if (applyMode) {
      for (const batch of chunk(proposals, UPDATE_BATCH_SIZE)) {
        // Group by contact so each UPDATE sets one contact_id over many ids. The
        // re-checked filters guarantee already-matched / deactivated rows are
        // never touched, even if the DB changed since the read.
        const idsByContact = new Map<string, string[]>();
        for (const proposal of batch) {
          const ids = idsByContact.get(proposal.contactId) ?? [];
          ids.push(proposal.messageId);
          idsByContact.set(proposal.contactId, ids);
        }
        for (const [contactId, ids] of idsByContact) {
          const { error } = await supabase
            .from("conversation_messages")
            .update({
              contact_id: contactId,
              match_status: "matched",
              matched_via: MATCHED_VIA_BACKFILL,
            })
            .in("id", ids)
            .eq("match_status", "unmatched")
            .is("deactivated_at", null);
          if (error) throw new Error(error.message);
          applied += ids.length;
        }
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: applyMode ? "apply" : "dry-run",
      existingMatchedVia,
      backfillMatchedVia: MATCHED_VIA_BACKFILL,
      totals: {
        unmatchedMessages: unmatchedCount,
        proposedMatches: proposals.length,
        distinctParticipants: pairs.length,
        distinctContacts: new Set(proposals.map((p) => p.contactId)).size,
        applied,
      },
      pairs,
    };
    const dir = path.join(process.cwd(), ".admin-ai-debug");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `whatsapp-match-backfill-${stamp}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2), "utf8");

    const lines = [
      "=".repeat(80),
      `WHATSAPP MATCH BACKFILL · mode=${report.mode}`,
      "=".repeat(80),
      `Existing matched_via values: ${existingMatchedVia.join(", ") || "(none)"}`,
      `Unmatched messages scanned: ${unmatchedCount}`,
      `Proposed matches: ${proposals.length} across ${pairs.length} participant→contact pairs`,
      "-".repeat(80),
      ...pairs
        .slice(0, 60)
        .map(
          (pair) =>
            `${pair.participant.padEnd(20)} → ${pair.contactName} (${pair.contactId})  ×${pair.count}`,
        ),
      "-".repeat(80),
      applyMode ? `APPLIED: ${applied} rows set to matched` : "DRY RUN: no rows changed",
      `Report: ${file}`,
      "=".repeat(80),
    ];
    console.info(`\n${lines.join("\n")}\n`);

    expect(proposals.length).toBeGreaterThanOrEqual(0);
  }, 600_000);
});
