"use server";

import { revalidatePath } from "next/cache";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/data/notifications";

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = formData.get("notificationId");
  if (typeof notificationId !== "string") {
    throw new Error("Notification id is required");
  }

  await markNotificationRead(notificationId);
  revalidatePath("/profile", "layout");
  revalidatePath("/profile/notifications");
}

export async function markAllNotificationsReadAction() {
  await markAllNotificationsRead();
  revalidatePath("/profile", "layout");
  revalidatePath("/profile/notifications");
}
