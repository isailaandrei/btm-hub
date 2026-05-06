import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_PORTFOLIO_BUCKET } from "@/lib/storage/profile-portfolio";
import type {
  ProfilePortfolioItem,
  ProfilePortfolioItemWithUrl,
} from "@/types/database";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

async function attachSignedUrls(
  rows: ProfilePortfolioItem[],
): Promise<ProfilePortfolioItemWithUrl[]> {
  if (rows.length === 0) return [];

  const supabase = await createAdminClient();
  const paths = rows.map((row) => row.storage_path);
  const { data, error } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    return rows.map((row) => ({
      ...row,
      signedUrl: null,
      imageError: `Failed to sign portfolio images: ${error.message}`,
    }));
  }

  const signedByPath = new Map(
    (data ?? []).map((item) => [item.path, item.signedUrl] as const),
  );

  return rows.map((row) => {
    const signedUrl = signedByPath.get(row.storage_path);
    if (!signedUrl) {
      return {
        ...row,
        signedUrl: null,
        imageError: `Missing signed URL for portfolio item ${row.id}`,
      };
    }

    return { ...row, signedUrl, imageError: null };
  });
}

export const getPortfolioItemsByProfileId = cache(
  async function getPortfolioItemsByProfileId(
    profileId: string,
  ): Promise<ProfilePortfolioItemWithUrl[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profile_portfolio_items")
      .select("*")
      .eq("profile_id", profileId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load portfolio items: ${error.message}`);
    }

    return attachSignedUrls((data ?? []) as ProfilePortfolioItem[]);
  },
);

export const getPortfolioItemsByContactProfileId = cache(
  async function getPortfolioItemsByContactProfileId(input: {
    profileId: string | null;
  }): Promise<ProfilePortfolioItemWithUrl[]> {
    if (!input.profileId) return [];
    return getPortfolioItemsByProfileId(input.profileId);
  },
);
