import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  Application,
  ApplicationStatus,
  ApplicationSummary,
  ApplicationShare,
  AdminNote,
  ProgramSlug,
  SharedApplicationView,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { getApplicantName } from "./applicant-name";

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
    // Escape PostgREST filter special characters and LIKE wildcards
    const escaped = search.replace(/[%_\\]/g, "\\$&").replace(/[.,()]/g, "");
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
// Tags
// TODO: addApplicationTag, removeApplicationTag, and addAdminNote use a
// read-modify-write pattern that is not concurrency-safe. If two admins
// mutate the same application's tags/notes simultaneously, the second write
// can silently overwrite the first. Replace with Postgres RPC functions using
// atomic array_append / array_remove to eliminate the race window.
// ---------------------------------------------------------------------------

export async function addApplicationTag(
  id: string,
  tag: string,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const existing = await getApplicationById(id);
  if (!existing) throw new Error("Application not found");

  const tags = existing.tags.includes(tag)
    ? existing.tags
    : [...existing.tags, tag];

  const { data, error } = await supabase
    .from("applications")
    .update({ tags })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to add tag: ${error.message}`);

  return data;
}

export async function removeApplicationTag(
  id: string,
  tag: string,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const existing = await getApplicationById(id);
  if (!existing) throw new Error("Application not found");

  const tags = existing.tags.filter((t) => t !== tag);

  const { data, error } = await supabase
    .from("applications")
    .update({ tags })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to remove tag: ${error.message}`);

  return data;
}

// ---------------------------------------------------------------------------
// Admin notes
// ---------------------------------------------------------------------------

export async function addAdminNote(
  applicationId: string,
  authorId: string,
  authorName: string,
  text: string,
): Promise<Application> {
  await requireAdmin();
  const supabase = await createClient();

  const existing = await getApplicationById(applicationId);
  if (!existing) throw new Error("Application not found");

  const note: AdminNote = {
    author_id: authorId,
    author_name: authorName,
    text,
    created_at: new Date().toISOString(),
  };

  const admin_notes = [...existing.admin_notes, note];

  const { data, error } = await supabase
    .from("applications")
    .update({ admin_notes })
    .eq("id", applicationId)
    .select()
    .single();

  if (error) throw new Error(`Failed to add admin note: ${error.message}`);

  return data;
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
