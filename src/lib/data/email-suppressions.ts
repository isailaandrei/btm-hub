import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailSuppression, EmailSuppressionReason } from "@/types/database";

export interface EmailExclusionRow {
  id: string;
  email: string;
  contactId: string | null;
  contactName: string | null;
  reason: EmailSuppressionReason;
  detail: string;
  provider: string | null;
  createdAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readEmbeddedContactName(value: unknown): string | null {
  // PostgREST returns a to-one embed as an object (or null); be defensive.
  const record = Array.isArray(value) ? value[0] : value;
  if (record && typeof record === "object" && "name" in record) {
    const name = (record as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? name : null;
  }
  return null;
}

/**
 * Every currently-active exclusion, newest first, with the contact's name when
 * the suppression is linked to one. Powers Audiences → Excluded.
 */
export async function listEmailExclusions(): Promise<EmailExclusionRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_suppressions")
    .select(
      "id, email, contact_id, reason, detail, provider, created_at, contacts(name)",
    )
    .is("lifted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load email exclusions: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    contactId: (row.contact_id as string | null) ?? null,
    contactName: readEmbeddedContactName(row.contacts),
    reason: row.reason as EmailSuppressionReason,
    detail: (row.detail as string) ?? "",
    provider: (row.provider as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

/**
 * The active suppression for a contact, matched by id OR email so a per-contact
 * toggle reflects bounces/unsubscribes (which key on email) as well as manual
 * exclusions. Returns null when the contact can currently receive email.
 */
export async function getActiveSuppressionForContact(input: {
  contactId: string;
  email: string;
}): Promise<EmailSuppression | null> {
  await requireAdmin();
  const supabase = await createClient();
  const email = normalizeEmail(input.email);
  const { data, error } = await supabase
    .from("email_suppressions")
    .select("*")
    .is("lifted_at", null)
    .or(`contact_id.eq.${input.contactId},email.eq.${email}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load contact suppression: ${error.message}`);
  }
  return (data as EmailSuppression | null) ?? null;
}

/** Manually exclude a contact's email from all sends (admin "do not email"). */
export async function excludeContactEmail(input: {
  contactId: string;
  email: string;
  detail?: string;
}): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("email_suppressions").insert({
    contact_id: input.contactId,
    email: normalizeEmail(input.email),
    reason: "do_not_contact",
    detail: input.detail ?? "Manually excluded by admin",
    created_by: profile.id,
  });
  // 23505 = an active suppression already exists; they are already excluded.
  if (error && error.code !== "23505") {
    throw new Error(`Failed to exclude contact email: ${error.message}`);
  }
}

/**
 * Lift the active exclusion(s) for a contact (by id OR email). Un-excluding is a
 * consent action, so this is always a single deliberate admin click — never bulk.
 */
export async function liftContactExclusion(input: {
  contactId: string;
  email: string;
}): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_suppressions")
    .update({ lifted_at: new Date().toISOString(), lifted_by: profile.id })
    .is("lifted_at", null)
    .or(`contact_id.eq.${input.contactId},email.eq.${normalizeEmail(input.email)}`);

  if (error) {
    throw new Error(`Failed to lift contact exclusion: ${error.message}`);
  }
}

/** Lift a single exclusion by id (the Remove button in Audiences → Excluded). */
export async function liftEmailExclusion(suppressionId: string): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_suppressions")
    .update({ lifted_at: new Date().toISOString(), lifted_by: profile.id })
    .eq("id", suppressionId)
    .is("lifted_at", null);

  if (error) {
    throw new Error(`Failed to lift email exclusion: ${error.message}`);
  }
}
