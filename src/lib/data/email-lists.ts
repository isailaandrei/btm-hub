import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailList } from "@/types/database";

export interface EmailListSummary extends EmailList {
  memberCount: number;
}

export interface EmailListMemberRow {
  id: string;
  email: string;
  name: string;
  source: "contact" | "manual";
  contactId: string | null;
  manualRecipientId: string | null;
}

function readEmbeddedName(value: unknown): string | null {
  const record = Array.isArray(value) ? value[0] : value;
  if (record && typeof record === "object" && "name" in record) {
    const name = (record as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? name : null;
  }
  return null;
}

function readEmbeddedCount(value: unknown): number {
  const record = Array.isArray(value) ? value[0] : value;
  if (record && typeof record === "object" && "count" in record) {
    const count = (record as { count?: unknown }).count;
    return typeof count === "number" ? count : 0;
  }
  return 0;
}

export async function listEmailLists(): Promise<EmailListSummary[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_lists")
    .select("*, email_list_members(count)")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load mailing lists: ${error.message}`);
  return (data ?? []).map((row) => {
    const { email_list_members, ...list } = row as EmailList & {
      email_list_members: unknown;
    };
    return { ...list, memberCount: readEmbeddedCount(email_list_members) };
  });
}

export async function getEmailListWithMembers(listId: string): Promise<{
  list: EmailList;
  members: EmailListMemberRow[];
} | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: list, error: listError } = await supabase
    .from("email_lists")
    .select("*")
    .eq("id", listId)
    .maybeSingle();
  if (listError) {
    throw new Error(`Failed to load mailing list: ${listError.message}`);
  }
  if (!list) return null;

  const { data: members, error: membersError } = await supabase
    .from("email_list_members")
    .select(
      "id, contact_id, manual_recipient_id, email, added_at, contacts(name), email_manual_recipients(name)",
    )
    .eq("list_id", listId)
    .order("added_at", { ascending: true });
  if (membersError) {
    throw new Error(`Failed to load list members: ${membersError.message}`);
  }

  return {
    list: list as EmailList,
    members: (members ?? []).map((row) => {
      const isContact = Boolean(row.contact_id);
      const name =
        readEmbeddedName(row.contacts) ??
        readEmbeddedName(row.email_manual_recipients) ??
        (row.email as string);
      return {
        id: row.id as string,
        email: row.email as string,
        name,
        source: isContact ? "contact" : "manual",
        contactId: (row.contact_id as string | null) ?? null,
        manualRecipientId: (row.manual_recipient_id as string | null) ?? null,
      };
    }),
  };
}

/** Resolve contact/manual recipient ids to email-list-member insert rows. */
async function buildMemberRows(
  listId: string,
  contactIds: string[],
  manualRecipientIds: string[],
): Promise<
  Array<{
    list_id: string;
    contact_id: string | null;
    manual_recipient_id: string | null;
    email: string;
  }>
> {
  const supabase = await createClient();
  const rows: Array<{
    list_id: string;
    contact_id: string | null;
    manual_recipient_id: string | null;
    email: string;
  }> = [];

  if (contactIds.length > 0) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, email")
      .in("id", contactIds);
    if (error) throw new Error(`Failed to resolve contacts: ${error.message}`);
    for (const contact of data ?? []) {
      rows.push({
        list_id: listId,
        contact_id: contact.id as string,
        manual_recipient_id: null,
        email: (contact.email as string).trim().toLowerCase(),
      });
    }
  }

  if (manualRecipientIds.length > 0) {
    const { data, error } = await supabase
      .from("email_manual_recipients")
      .select("id, email")
      .in("id", manualRecipientIds);
    if (error) {
      throw new Error(`Failed to resolve saved recipients: ${error.message}`);
    }
    for (const recipient of data ?? []) {
      rows.push({
        list_id: listId,
        contact_id: null,
        manual_recipient_id: recipient.id as string,
        email: (recipient.email as string).trim().toLowerCase(),
      });
    }
  }

  return rows;
}

export async function createEmailList(input: {
  name: string;
  description?: string;
  contactIds?: string[];
  manualRecipientIds?: string[];
}): Promise<EmailList> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data: list, error } = await supabase
    .from("email_lists")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create mailing list: ${error.message}`);

  const rows = await buildMemberRows(
    list.id as string,
    input.contactIds ?? [],
    input.manualRecipientIds ?? [],
  );
  if (rows.length > 0) {
    const { error: memberError } = await supabase
      .from("email_list_members")
      .insert(rows);
    if (memberError) {
      throw new Error(`Failed to add list members: ${memberError.message}`);
    }
  }

  return list as EmailList;
}

export async function updateEmailList(input: {
  id: string;
  name: string;
  description?: string;
}): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_lists")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(`Failed to update mailing list: ${error.message}`);
}

export async function deleteEmailList(listId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("email_lists").delete().eq("id", listId);
  if (error) throw new Error(`Failed to delete mailing list: ${error.message}`);
}

export async function addEmailListMembers(input: {
  listId: string;
  contactIds?: string[];
  manualRecipientIds?: string[];
}): Promise<{ added: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  // Skip members already on the list so a bulk insert never trips the unique
  // indexes (a partial unique can't be used as an upsert conflict target).
  const { data: existing, error: existingError } = await supabase
    .from("email_list_members")
    .select("contact_id, manual_recipient_id")
    .eq("list_id", input.listId);
  if (existingError) {
    throw new Error(`Failed to read list members: ${existingError.message}`);
  }
  const existingContactIds = new Set(
    (existing ?? []).map((m) => m.contact_id).filter(Boolean) as string[],
  );
  const existingManualIds = new Set(
    (existing ?? [])
      .map((m) => m.manual_recipient_id)
      .filter(Boolean) as string[],
  );

  const newContactIds = (input.contactIds ?? []).filter(
    (id) => !existingContactIds.has(id),
  );
  const newManualIds = (input.manualRecipientIds ?? []).filter(
    (id) => !existingManualIds.has(id),
  );

  const rows = await buildMemberRows(input.listId, newContactIds, newManualIds);
  if (rows.length > 0) {
    const { error } = await supabase.from("email_list_members").insert(rows);
    if (error) throw new Error(`Failed to add list members: ${error.message}`);
    await supabase
      .from("email_lists")
      .update({ updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", input.listId);
  }
  return { added: rows.length };
}

export async function removeEmailListMember(memberId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_list_members")
    .delete()
    .eq("id", memberId);
  if (error) throw new Error(`Failed to remove list member: ${error.message}`);
}

/**
 * Resolve one or more lists to the contact/manual recipient ids their members
 * point at, so a send can feed them through the existing eligibility pipeline.
 */
export async function resolveEmailListRecipientIds(listIds: string[]): Promise<{
  contactIds: string[];
  manualRecipientIds: string[];
}> {
  if (listIds.length === 0) return { contactIds: [], manualRecipientIds: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_list_members")
    .select("contact_id, manual_recipient_id")
    .in("list_id", listIds);
  if (error) {
    throw new Error(`Failed to resolve list recipients: ${error.message}`);
  }
  const contactIds = new Set<string>();
  const manualRecipientIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.contact_id) contactIds.add(row.contact_id as string);
    if (row.manual_recipient_id) {
      manualRecipientIds.add(row.manual_recipient_id as string);
    }
  }
  return {
    contactIds: [...contactIds],
    manualRecipientIds: [...manualRecipientIds],
  };
}

export async function getEmailListNames(listIds: string[]): Promise<string[]> {
  if (listIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_lists")
    .select("name")
    .in("id", listIds);
  if (error) throw new Error(`Failed to load list names: ${error.message}`);
  return (data ?? []).map((row) => row.name as string);
}
