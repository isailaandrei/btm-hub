"use server";

import { redirect } from "next/navigation";
import { unsubscribeNewsletterByToken } from "@/lib/data/email-sends";

export async function confirmNewsletterUnsubscribeAction(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string" || !token.trim()) {
    redirect("/email/unsubscribe/invalid?status=not-found");
  }

  const normalizedToken = token.trim();
  const ok = await unsubscribeNewsletterByToken(normalizedToken);
  redirect(
    `/email/unsubscribe/${encodeURIComponent(normalizedToken)}?status=${
      ok ? "confirmed" : "not-found"
    }`,
  );
}
