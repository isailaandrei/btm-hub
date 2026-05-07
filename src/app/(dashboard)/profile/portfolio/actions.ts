"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { getContactIdsByProfileId } from "@/lib/data/contacts";
import { createClient } from "@/lib/supabase/server";
import {
  isAllowedPortfolioImageType,
  PROFILE_PORTFOLIO_BUCKET,
  storagePathBelongsToProfile,
} from "@/lib/storage/profile-portfolio";

const metadataSchema = z.object({
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().refine(isAllowedPortfolioImageType, {
    message: "Portfolio images must be JPEG, PNG, or WebP.",
  }),
  sizeBytes: z.number().int().positive(),
  title: z.string().max(120).optional().default(""),
  caption: z.string().max(1000).optional().default(""),
});

const updateSchema = z.object({
  title: z.string().max(120).optional().default(""),
  caption: z.string().max(1000).optional().default(""),
});

const MAX_PORTFOLIO_ITEMS = 50;

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be logged in.");
  return { supabase, userId: user.id };
}

function cleanOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function revalidatePortfolioSurfaces(profileId: string) {
  revalidatePath("/profile", "layout");
  revalidatePath(`/community/members/${profileId}`);
  revalidatePath("/admin");

  const contactIds = await getContactIdsByProfileId(profileId);
  for (const contactId of contactIds) {
    revalidatePath(`/admin/contacts/${contactId}`);
  }
}

async function assertPortfolioCapacity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
) {
  const { count, error } = await supabase
    .from("profile_portfolio_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (error) throw new Error(`Failed to count portfolio items: ${error.message}`);
  if ((count ?? 0) >= MAX_PORTFOLIO_ITEMS) {
    throw new Error(`Portfolio limit reached (${MAX_PORTFOLIO_ITEMS} images).`);
  }
}

async function assertUploadedObjectExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
) {
  const [folder, ...nameParts] = storagePath.split("/");
  const fileName = nameParts.join("/");
  if (!folder || !fileName || fileName.includes("/")) {
    throw new Error("Invalid portfolio storage path.");
  }

  const { data, error } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .list(folder, { search: fileName, limit: 10 });

  if (error) {
    throw new Error(`Failed to verify portfolio image: ${error.message}`);
  }

  const exists = (data ?? []).some((item) => item.name === fileName);
  if (!exists) throw new Error("Uploaded portfolio image was not found.");
}

async function cleanupUploadedObjectAndThrow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
  error: unknown,
): Promise<never> {
  const original =
    error instanceof Error
      ? error
      : new Error("Failed to save portfolio item.");
  const { error: removeError } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .remove([storagePath]);

  if (removeError) {
    throw new Error(
      `${original.message} Failed to clean up uploaded portfolio image: ${removeError.message}`,
    );
  }

  throw original;
}

export async function createPortfolioItemAction(input: {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  title?: string;
  caption?: string;
}) {
  const { supabase, userId } = await requireUserId();
  const parsed = metadataSchema.parse(input);

  if (!storagePathBelongsToProfile(parsed.storagePath, userId)) {
    throw new Error("Invalid portfolio storage path.");
  }

  let createdItem: { id: string } | null = null;

  try {
    await assertPortfolioCapacity(supabase, userId);
    await assertUploadedObjectExists(supabase, parsed.storagePath);

    const { data, error } = await supabase
      .from("profile_portfolio_items")
      .insert({
        profile_id: userId,
        storage_path: parsed.storagePath,
        original_filename: parsed.originalFilename,
        mime_type: parsed.mimeType,
        size_bytes: parsed.sizeBytes,
        title: cleanOptionalText(parsed.title),
        caption: cleanOptionalText(parsed.caption),
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to save portfolio item: ${error.message}`);
    }

    createdItem = data as { id: string };
  } catch (error) {
    await cleanupUploadedObjectAndThrow(supabase, parsed.storagePath, error);
  }

  if (!createdItem) throw new Error("Failed to save portfolio item.");

  await revalidatePortfolioSurfaces(userId);
  return createdItem;
}

export async function updatePortfolioItemAction(
  id: string,
  input: { title?: string; caption?: string },
) {
  const { supabase, userId } = await requireUserId();
  const parsed = updateSchema.parse(input);

  const { data, error } = await supabase
    .from("profile_portfolio_items")
    .update({
      title: cleanOptionalText(parsed.title),
      caption: cleanOptionalText(parsed.caption),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to update portfolio item: ${error.message}`);
  if (!data) throw new Error("Portfolio item not found.");

  await revalidatePortfolioSurfaces(userId);
  return data as { id: string };
}

export async function deletePortfolioItemAction(id: string) {
  const { supabase, userId } = await requireUserId();
  const { data: item, error: loadError } = await supabase
    .from("profile_portfolio_items")
    .select("id, profile_id, storage_path")
    .eq("id", id)
    .eq("profile_id", userId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load portfolio item: ${loadError.message}`);
  }
  if (!item) throw new Error("Portfolio item not found.");

  const storagePath = (item as { storage_path: string }).storage_path;
  const { error: removeError } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .remove([storagePath]);

  if (removeError) {
    throw new Error(`Failed to delete portfolio image: ${removeError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("profile_portfolio_items")
    .delete()
    .eq("id", id)
    .eq("profile_id", userId);

  if (deleteError) {
    throw new Error(`Failed to delete portfolio item: ${deleteError.message}`);
  }

  await revalidatePortfolioSurfaces(userId);
}
