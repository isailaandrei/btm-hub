"use server";

import { redirect } from "next/navigation";
import { unsubscribeNewsletterByToken } from "@/lib/data/email-sends";

/** Optional self-reported reason categories shown on the unsubscribe page. */
const UNSUBSCRIBE_REASONS = new Set([
  "too_many",
  "not_relevant",
  "never_signed_up",
  "other",
]);

function readReason(formData: FormData): string | null {
  const value = formData.get("reason");
  return typeof value === "string" && UNSUBSCRIBE_REASONS.has(value)
    ? value
    : null;
}

function readComment(formData: FormData): string | null {
  const value = formData.get("comment");
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export async function confirmNewsletterUnsubscribeAction(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string" || !token.trim()) {
    redirect("/email/unsubscribe/invalid?status=not-found");
  }

  const normalizedToken = token.trim();
  const ok = await unsubscribeNewsletterByToken(normalizedToken, {
    reason: readReason(formData),
    comment: readComment(formData),
  });
  redirect(
    `/email/unsubscribe/${encodeURIComponent(normalizedToken)}?status=${
      ok ? "confirmed" : "not-found"
    }`,
  );
}
