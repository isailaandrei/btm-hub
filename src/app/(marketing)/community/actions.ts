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

// TODO(BTM-8): Add rate limiting (e.g., max N threads/hour per user)

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
    topic: formData.get("topic") as string,
    title: formData.get("title") as string,
    body: formData.get("body") as string,
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

  const { topic, title, body } = parsed.data;
  let slug = slugify(title);
  if (!slug) slug = slugifyUnique("thread");

  const supabase = await createClient();

  // Try inserting with the initial slug; on unique violation, retry with suffixed slug
  let { data, error } = await supabase
    .from("forum_threads")
    .insert({
      author_id: user.id,
      topic,
      title,
      slug,
      body,
    })
    .select("topic, slug")
    .single();

  if (error?.code === "23505") {
    slug = slugifyUnique(slugify(title) || "thread");
    const retry = await supabase
      .from("forum_threads")
      .insert({
        author_id: user.id,
        topic,
        title,
        slug,
        body,
      })
      .select("topic, slug")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return { errors: null, message: `Failed to create thread: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath(`/community/${topic}`);
  revalidatePath("/community");
  redirect(`/community/${data!.topic}/${data!.slug}`);
}

// TODO(BTM-8): Add rate limiting (e.g., max N replies/hour per user)

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

  const { threadId, body } = parsed.data;
  const supabase = await createClient();

  // Check thread exists and is not locked (unless admin)
  const { data: thread, error: threadError } = await supabase
    .from("forum_threads")
    .select("topic, slug, locked")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return { errors: null, message: "Thread not found.", success: false, resetKey: prevState.resetKey };
  }

  if (thread.locked) {
    // Check if user is admin
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
      body,
    });

  if (error) {
    return { errors: null, message: `Failed to post reply: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath(`/community/${thread.topic}/${thread.slug}`);
  revalidatePath(`/community/${thread.topic}`);
  return { errors: null, message: "Reply posted!", success: true, resetKey: prevState.resetKey + 1 };
}

// ---------------------------------------------------------------------------
// Imperative actions (called directly, throw on error)
// ---------------------------------------------------------------------------

export async function editThread(threadId: string, body: string): Promise<void> {
  validateUUID(threadId, "thread");

  const parsed = editThreadSchema.safeParse({ body });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  // Check ownership or admin
  const { data: thread, error: fetchError } = await supabase
    .from("forum_threads")
    .select("author_id, topic, slug")
    .eq("id", threadId)
    .single();

  if (fetchError || !thread) throw new Error("Thread not found");

  if (thread.author_id !== user.id) {
    await requireAdmin();
  }

  const { error } = await supabase
    .from("forum_threads")
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq("id", threadId);

  if (error) throw new Error(`Failed to edit thread: ${error.message}`);

  revalidatePath(`/community/${thread.topic}/${thread.slug}`);
}

export async function editReply(postId: string, body: string): Promise<void> {
  validateUUID(postId, "reply");

  const parsed = editReplySchema.safeParse({ body });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

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
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) throw new Error(`Failed to edit reply: ${error.message}`);

  // Revalidate thread page
  const { data: thread } = await supabase
    .from("forum_threads")
    .select("topic, slug")
    .eq("id", post.thread_id)
    .single();

  if (thread) revalidatePath(`/community/${thread.topic}/${thread.slug}`);
}

export async function deleteThread(threadId: string, redirectPath: string): Promise<void> {
  validateUUID(threadId, "thread");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: thread, error: fetchError } = await supabase
    .from("forum_threads")
    .select("author_id, topic")
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

  revalidatePath(`/community/${thread.topic}`);
  revalidatePath("/community");
  redirect(redirectPath);
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
    .select("topic, slug")
    .eq("id", post.thread_id)
    .single();

  if (thread) {
    revalidatePath(`/community/${thread.topic}/${thread.slug}`);
    revalidatePath(`/community/${thread.topic}`);
  }
}

export async function toggleThreadPin(threadId: string): Promise<void> {
  validateUUID(threadId, "thread");
  await requireAdmin();

  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("topic, slug")
    .eq("id", threadId)
    .single();

  const { error } = await supabase.rpc("toggle_thread_pin", {
    _thread_id: threadId,
  });

  if (error) throw new Error(`Failed to toggle pin: ${error.message}`);

  revalidatePath("/community");
  if (thread) {
    revalidatePath(`/community/${thread.topic}`);
    revalidatePath(`/community/${thread.topic}/${thread.slug}`);
  }
}

export async function toggleThreadLock(threadId: string): Promise<void> {
  validateUUID(threadId, "thread");
  await requireAdmin();

  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("topic, slug")
    .eq("id", threadId)
    .single();

  const { error } = await supabase.rpc("toggle_thread_lock", {
    _thread_id: threadId,
  });

  if (error) throw new Error(`Failed to toggle lock: ${error.message}`);

  revalidatePath("/community");
  if (thread) {
    revalidatePath(`/community/${thread.topic}`);
    revalidatePath(`/community/${thread.topic}/${thread.slug}`);
  }
}
