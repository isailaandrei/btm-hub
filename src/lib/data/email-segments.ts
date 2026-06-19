import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { EmailSegment, EmailSegmentRule } from "@/types/database";

export interface EmailSegmentSummary extends EmailSegment {
  matchCount: number;
}

/** Coerce free-form JSONB into a well-formed rule. */
export function normalizeSegmentRule(raw: unknown): EmailSegmentRule {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const match = record.match === "any" ? "any" : "all";
  const toIds = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  return {
    match,
    includeTagIds: toIds(record.includeTagIds),
    excludeTagIds: toIds(record.excludeTagIds),
  };
}

function toSegment(row: Record<string, unknown>): EmailSegment {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    rule: normalizeSegmentRule(row.rule),
    created_by: row.created_by as string,
    updated_by: row.updated_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** Contacts that currently match a rule, via the resolve RPC. */
export async function resolveSegmentContactIds(
  rule: EmailSegmentRule,
): Promise<string[]> {
  // No include tags + no exclude tags would resolve to everyone — that's not a
  // segment, so return nobody. But an exclude-only rule (no include, some
  // exclude) is "everybody except …" and must hit the RPC.
  if (rule.includeTagIds.length === 0 && rule.excludeTagIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_email_segment_contacts", {
    p_include: rule.includeTagIds,
    p_exclude: rule.excludeTagIds,
    p_match: rule.match,
  });
  if (error) {
    throw new Error(`Failed to resolve segment: ${error.message}`);
  }
  return (data ?? []).map((row: { contact_id: string }) => row.contact_id);
}

export async function countSegmentMatches(
  rule: EmailSegmentRule,
): Promise<number> {
  const ids = await resolveSegmentContactIds(rule);
  return ids.length;
}

export async function listEmailSegments(): Promise<EmailSegmentSummary[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_segments")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load segments: ${error.message}`);

  const segments = (data ?? []).map((row) => toSegment(row));
  // Match counts are dynamic; compute them off the current tag data.
  const counts = await Promise.all(
    segments.map((segment) => countSegmentMatches(segment.rule)),
  );
  return segments.map((segment, index) => ({
    ...segment,
    matchCount: counts[index] ?? 0,
  }));
}

export async function createEmailSegment(input: {
  name: string;
  description?: string;
  rule: EmailSegmentRule;
}): Promise<EmailSegment> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_segments")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      rule: input.rule,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create segment: ${error.message}`);
  return toSegment(data);
}

export async function updateEmailSegment(input: {
  id: string;
  name: string;
  description?: string;
  rule: EmailSegmentRule;
}): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_segments")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      rule: input.rule,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(`Failed to update segment: ${error.message}`);
}

export async function deleteEmailSegment(segmentId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_segments")
    .delete()
    .eq("id", segmentId);
  if (error) throw new Error(`Failed to delete segment: ${error.message}`);
}

/** Resolve one or more segments to the contacts they currently match (union). */
export async function resolveSegmentsContactIds(
  segmentIds: string[],
): Promise<string[]> {
  if (segmentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_segments")
    .select("rule")
    .in("id", segmentIds);
  if (error) {
    throw new Error(`Failed to load segments: ${error.message}`);
  }
  const contactIds = new Set<string>();
  for (const row of data ?? []) {
    const ids = await resolveSegmentContactIds(normalizeSegmentRule(row.rule));
    for (const id of ids) contactIds.add(id);
  }
  return [...contactIds];
}

export async function getEmailSegmentNames(
  segmentIds: string[],
): Promise<string[]> {
  if (segmentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_segments")
    .select("name")
    .in("id", segmentIds);
  if (error) throw new Error(`Failed to load segment names: ${error.message}`);
  return (data ?? []).map((row) => row.name as string);
}
