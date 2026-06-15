import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailManualRecipient } from "@/types/database";

export const listEmailManualRecipients = cache(
  async function listEmailManualRecipients(): Promise<EmailManualRecipient[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_manual_recipients")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to load saved email recipients: ${error.message}`);
    }
    return (data ?? []) as EmailManualRecipient[];
  },
);

export async function getEmailManualRecipientsByIds(
  ids: string[],
): Promise<EmailManualRecipient[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_manual_recipients")
    .select("*")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(`Failed to load saved email recipients: ${error.message}`);
  }
  return (data ?? []) as EmailManualRecipient[];
}

export async function upsertEmailManualRecipient(input: {
  email: string;
  name?: string;
  notes?: string;
}): Promise<EmailManualRecipient> {
  const profile = await requireAdmin();
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || email;
  const notes = input.notes?.trim() ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_manual_recipients")
    .upsert(
      {
        email,
        name,
        notes,
        created_by: profile.id,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save email recipient: ${error.message}`);
  }
  return data as EmailManualRecipient;
}
