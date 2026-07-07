import { createAdminClient } from "@/lib/supabase/admin";

export type ContactAiSummary = {
  contactId: string;
  summary: string;
  cardContentHash: string;
  model: string;
  generatedAt: string;
};

export async function getContactAiSummary(
  contactId: string,
): Promise<ContactAiSummary | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("contact_ai_summaries")
    .select("contact_id, summary, card_content_hash, model, generated_at")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load contact AI summary: ${error.message}`);
  }
  if (!data) return null;
  const row = data as {
    contact_id: string;
    summary: string;
    card_content_hash: string;
    model: string;
    generated_at: string;
  };
  return {
    contactId: row.contact_id,
    summary: row.summary,
    cardContentHash: row.card_content_hash,
    model: row.model,
    generatedAt: row.generated_at,
  };
}

/** contactId -> stored card hash, for staleness comparison in one query. */
export async function listContactAiSummaryHashes(): Promise<Map<string, string>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("contact_ai_summaries")
    .select("contact_id, card_content_hash");
  if (error) {
    throw new Error(`Failed to list contact AI summary hashes: ${error.message}`);
  }
  return new Map(
    ((data ?? []) as Array<{ contact_id: string; card_content_hash: string }>).map(
      (row) => [row.contact_id, row.card_content_hash],
    ),
  );
}

export async function upsertContactAiSummary(input: {
  contactId: string;
  summary: string;
  responseJson: unknown;
  cardContentHash: string;
  model: string;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.from("contact_ai_summaries").upsert(
    [
      {
        contact_id: input.contactId,
        summary: input.summary,
        response_json: input.responseJson,
        card_content_hash: input.cardContentHash,
        model: input.model,
        generated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "contact_id" },
  );
  if (error) {
    throw new Error(`Failed to upsert contact AI summary: ${error.message}`);
  }
}
