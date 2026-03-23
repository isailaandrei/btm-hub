import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import { escapeSearchTerm } from "@/lib/validation-helpers";
import type {
  Application,
  ApplicationStatus,
  ApplicationSummary,
  ApplicationShare,
  ProgramSlug,
  SharedApplicationView,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { getApplicantName } from "./applicant-name";
export { escapeSearchTerm } from "@/lib/validation-helpers";

// ---------------------------------------------------------------------------
// Filters / pagination
// ---------------------------------------------------------------------------

export interface ApplicationFilters {
  program?: ProgramSlug;
  status?: ApplicationStatus;
  tag?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getApplications = cache(async function getApplications(
  filters: ApplicationFilters = {},
): Promise<{ data: Application[]; count: number }> {
  const supabase = await createClient();
  const { page = 1, limit = 20, program, status, tag, search } = filters;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("applications")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(from, to);

  if (program) query = query.eq("program", program);
  if (status) query = query.eq("status", status);
  if (tag) query = query.contains("tags", [tag]);
  if (search) {
    const escaped = escapeSearchTerm(search);
    query = query.or(`answers->>first_name.ilike.%${escaped}%,answers->>last_name.ilike.%${escaped}%,answers->>email.ilike.%${escaped}%`);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(`Failed to fetch applications: ${error.message}`);

  return { data: data ?? [], count: count ?? 0 };
});

export const getApplicationById = cache(async function getApplicationById(
  id: string,
): Promise<Application | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`Failed to fetch application: ${error.message}`);
  }

  return data;
});

// ---------------------------------------------------------------------------
// Current user's applications
// ---------------------------------------------------------------------------

export const getMyApplications = cache(async function getMyApplications(): Promise<ApplicationSummary[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id, program, status, answers, submitted_at, updated_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch your applications: ${error.message}`);

  return data ?? [];
});

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export async function submitApplication(
  program: ProgramSlug,
  answers: Record<string, unknown>,
  userId?: string,
): Promise<Application> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .insert({
      program,
      answers,
      user_id: userId ?? null,
      status: "reviewing" as ApplicationStatus,
      tags: [],
      admin_notes: [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to submit application: ${error.message}`);

  return data;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update application status: ${error.message}`);

  return data;
}

// ---------------------------------------------------------------------------
// Tags (atomic via Postgres RPC — no read-modify-write race)
// ---------------------------------------------------------------------------

export async function addApplicationTag(
  id: string,
  tag: string,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("add_application_tag", {
    app_id: id,
    new_tag: tag,
  });

  if (error) throw new Error(`Failed to add tag: ${error.message}`);

  // RPC returns applications row as jsonb — shape matches Application by definition
  return data as Application;
}

export async function removeApplicationTag(
  id: string,
  tag: string,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("remove_application_tag", {
    app_id: id,
    old_tag: tag,
  });

  if (error) throw new Error(`Failed to remove tag: ${error.message}`);

  // RPC returns applications row as jsonb — shape matches Application by definition
  return data as Application;
}

// ---------------------------------------------------------------------------
// Admin notes (atomic via Postgres RPC — no read-modify-write race)
// ---------------------------------------------------------------------------

export async function addAdminNote(
  applicationId: string,
  authorId: string,
  authorName: string,
  text: string,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("add_admin_note", {
    app_id: applicationId,
    note_author_id: authorId,
    note_author_name: authorName,
    note_text: text,
  });

  if (error) throw new Error(`Failed to add admin note: ${error.message}`);

  // RPC returns applications row as jsonb — shape matches Application by definition
  return data as Application;
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export async function createShareLink(
  applicationId: string,
  createdBy: string,
  expiresInDays?: number,
): Promise<ApplicationShare> {
  const supabase = await createClient();

  const token = crypto.randomUUID();
  const expires_at = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("application_shares")
    .insert({
      application_id: applicationId,
      token,
      created_by: createdBy,
      expires_at,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create share link: ${error.message}`);

  return data;
}

export async function getSharedApplication(
  token: string,
): Promise<SharedApplicationView | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shared_application", {
    share_token: token,
  });

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch shared application: ${error.message}`);
  }

  return data;
}
