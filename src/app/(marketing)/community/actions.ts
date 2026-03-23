"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  createThreadSchema,
  createReplySchema,
  editThreadSchema,
  editReplySchema,
} from "@/lib/validations/forum";
import { slugify, slugifyUnique } from "@/lib/community/slugify";
import { sanitizeBody } from "@/lib/community/sanitize";
import type { BodyFormat } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ForumActionState = {
  errors: Record<string, string> | null;
  message: string;
  success: boolean;
  resetKey: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reserved slugs that conflict with route segments. */
const RESERVED_SLUGS = new Set(["new"]);

function conditionalSanitize(body: string, bodyFormat: BodyFormat): string {
  return bodyFormat === "html" ? sanitizeBody(body) : body;
}

// ---------------------------------------------------------------------------
// Form actions (useActionState pattern)
// ---------------------------------------------------------------------------

export async function createThread(
  prevState: ForumActionState,
  formData: FormData,
): Promise<ForumActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { errors: null, message: "You must be logged in to create a thread.", success: false, resetKey: prevState.resetKey };
  }

  const raw = {
    topic: formData.get("topic") as string || undefined,
    title: formData.get("title") as string,
    body: formData.get("body") as string,
    bodyFormat: formData.get("bodyFormat") as string || undefined,
  };

  const parsed = createThreadSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { errors: fieldErrors, message: "", success: false, resetKey: prevState.resetKey };
  }

  const { topic, title, body, bodyFormat } = parsed.data;
  const sanitizedBody = conditionalSanitize(body, bodyFormat);

  let slug = slugify(title);
  if (slug.length < 2 || RESERVED_SLUGS.has(slug)) slug = slugifyUnique(slug || "thread");

  const supabase = await createClient();

  let { data, error } = await supabase
    .from("forum_threads")
    .insert({
      author_id: user.id,
      topic: topic ?? null,
      title,
      slug,
    })
    .select("id, slug")
    .single();

  if (error?.code === "23505") {
    slug = slugifyUnique(slugify(title) || "thread");
    const retry = await supabase
      .from("forum_threads")
      .insert({
        author_id: user.id,
        topic: topic ?? null,
        title,
        slug,
      })
      .select("id, slug")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return { errors: null, message: `Failed to create thread: ${error?.message ?? "Unknown error"}`, success: false, resetKey: prevState.resetKey };
  }

  const { error: opError } = await supabase
    .from("forum_posts")
    .insert({
      thread_id: data.id,
      author_id: user.id,
      body: sanitizedBody,
      body_format: bodyFormat,
      is_op: true,
    });

  if (opError) {
    await supabase.from("forum_threads").delete().eq("id", data.id);
    return { errors: null, message: `Failed to create thread: ${opError.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath("/community");
  redirect(`/community/${data.slug}`);
}

export async function createReply(
  prevState: ForumActionState,
  formData: FormData,
): Promise<ForumActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { errors: null, message: "You must be logged in to reply.", success: false, resetKey: prevState.resetKey };
  }

  const raw = {
    threadId: formData.get("threadId") as string,
    body: formData.get("body") as string,
    bodyFormat: formData.get("bodyFormat") as string || undefined,
  };

  const parsed = createReplySchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { errors: fieldErrors, message: "", success: false, resetKey: prevState.resetKey };
  }

  const { threadId, body, bodyFormat } = parsed.data;
  const sanitizedBody = conditionalSanitize(body, bodyFormat);
  const supabase = await createClient();

  const { data: thread, error: threadError } = await supabase
    .from("forum_threads")
    .select("slug, locked")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return { errors: null, message: "Thread not found.", success: false, resetKey: prevState.resetKey };
  }

  if (thread.locked) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return { errors: null, message: "This thread is locked.", success: false, resetKey: prevState.resetKey };
    }
  }

  const { error } = await supabase
    .from("forum_posts")
    .insert({
      thread_id: threadId,
      author_id: user.id,
      body: sanitizedBody,
      body_format: bodyFormat,
    });

  if (error) {
    return { errors: null, message: `Failed to post reply: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath(`/community/${thread.slug}`);
  revalidatePath("/community");
  return { errors: null, message: "Reply posted!", success: true, resetKey: prevState.resetKey + 1 };
}

// ---------------------------------------------------------------------------
// Imperative actions (called directly, throw on error)
// ---------------------------------------------------------------------------

export async function editThread(threadId: string, body: string, bodyFormat: BodyFormat = "markdown"): Promise<void> {
  validateUUID(threadId, "thread");

  const parsed = editThreadSchema.safeParse({ body, bodyFormat });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const sanitizedBody = conditionalSanitize(parsed.data.body, parsed.data.bodyFormat);
  const supabase = await createClient();

  const { data: thread, error: fetchError } = await supabase
    .from("forum_threads")
    .select("author_id, slug")
    .eq("id", threadId)
    .single();

  if (fetchError || !thread) throw new Error("Thread not found");

  if (thread.author_id !== user.id) {
    await requireAdmin();
  }

  const { error } = await supabase
    .from("forum_posts")
    .update({ body: sanitizedBody, updated_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("is_op", true);

  if (error) throw new Error(`Failed to edit thread: ${error.message}`);

  revalidatePath(`/community/${thread.slug}`);
}

export async function editReply(postId: string, body: string, bodyFormat: BodyFormat = "markdown"): Promise<void> {
  validateUUID(postId, "reply");

  const parsed = editReplySchema.safeParse({ body, bodyFormat });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const sanitizedBody = conditionalSanitize(parsed.data.body, parsed.data.bodyFormat);
  const supabase = await createClient();

  const { data: post, error: fetchError } = await supabase
    .from("forum_posts")
    .select("author_id, thread_id")
    .eq("id", postId)
    .single();

  if (fetchError || !post) throw new Error("Post not found");

  if (post.author_id !== user.id) {
    await requireAdmin();
  }

  const { error } = await supabase
    .from("forum_posts")
    .update({ body: sanitizedBody, updated_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) throw new Error(`Failed to edit reply: ${error.message}`);

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("slug")
    .eq("id", post.thread_id)
    .single();

  if (thread) revalidatePath(`/community/${thread.slug}`);
}

export async function deleteThread(threadId: string): Promise<void> {
  validateUUID(threadId, "thread");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: thread, error: fetchError } = await supabase
    .from("forum_threads")
    .select("author_id")
    .eq("id", threadId)
    .single();

  if (fetchError || !thread) throw new Error("Thread not found");

  if (thread.author_id !== user.id) {
    await requireAdmin();
  }

  const { error } = await supabase
    .from("forum_threads")
    .delete()
    .eq("id", threadId);

  if (error) throw new Error(`Failed to delete thread: ${error.message}`);

  revalidatePath("/community");
  redirect("/community");
}

export async function deleteReply(postId: string): Promise<void> {
  validateUUID(postId, "reply");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: post, error: fetchError } = await supabase
    .from("forum_posts")
    .select("author_id, thread_id")
    .eq("id", postId)
    .single();

  if (fetchError || !post) throw new Error("Post not found");

  if (post.author_id !== user.id) {
    await requireAdmin();
  }

  const { error } = await supabase
    .from("forum_posts")
    .delete()
    .eq("id", postId);

  if (error) throw new Error(`Failed to delete reply: ${error.message}`);

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("slug")
    .eq("id", post.thread_id)
    .single();

  if (thread) {
    revalidatePath(`/community/${thread.slug}`);
    revalidatePath("/community");
  }
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export async function toggleLike(postId: string): Promise<void> {
  validateUUID(postId, "post");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  // Try to insert — if already liked, delete (toggle)
  const { error: insertError } = await supabase
    .from("forum_likes")
    .insert({ post_id: postId, user_id: user.id });

  if (insertError) {
    if (insertError.code === "23505") {
      // Already liked — remove it
      const { error: deleteError } = await supabase
        .from("forum_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);

      if (deleteError) throw new Error(`Failed to unlike: ${deleteError.message}`);
    } else {
      throw new Error(`Failed to like: ${insertError.message}`);
    }
  }

  // Revalidate the thread page
  const { data: post } = await supabase
    .from("forum_posts")
    .select("thread_id")
    .eq("id", postId)
    .single();

  if (post) {
    const { data: thread } = await supabase
      .from("forum_threads")
      .select("slug")
      .eq("id", post.thread_id)
      .single();

    if (thread) revalidatePath(`/community/${thread.slug}`);
  }
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export async function toggleThreadPin(threadId: string): Promise<void> {
  validateUUID(threadId, "thread");
  await requireAdmin();

  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("slug")
    .eq("id", threadId)
    .single();

  const { error } = await supabase.rpc("toggle_thread_pin", {
    _thread_id: threadId,
  });

  if (error) throw new Error(`Failed to toggle pin: ${error.message}`);

  revalidatePath("/community");
  if (thread) revalidatePath(`/community/${thread.slug}`);
}

export async function toggleThreadLock(threadId: string): Promise<void> {
  validateUUID(threadId, "thread");
  await requireAdmin();

  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("slug")
    .eq("id", threadId)
    .single();

  const { error } = await supabase.rpc("toggle_thread_lock", {
    _thread_id: threadId,
  });

  if (error) throw new Error(`Failed to toggle lock: ${error.message}`);

  revalidatePath("/community");
  if (thread) revalidatePath(`/community/${thread.slug}`);
}
