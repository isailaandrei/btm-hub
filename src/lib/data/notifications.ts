import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { validateUUID } from "@/lib/validation-helpers";
import type {
  Notification,
  NotificationWithActor,
  Profile,
} from "@/types/database";
import type { NotificationInsert } from "@/lib/notifications/notifications";

const NOTIFICATIONS_PAGE_SIZE = 50;

type NotificationRow = Notification & {
  actor?:
    | Pick<Profile, "id" | "display_name" | "avatar_url">
    | Pick<Profile, "id" | "display_name" | "avatar_url">[]
    | null;
  profiles?:
    | Pick<Profile, "id" | "display_name" | "avatar_url">
    | Pick<Profile, "id" | "display_name" | "avatar_url">[]
    | null;
};

function mapNotification(row: NotificationRow): NotificationWithActor {
  const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    recipient_id: row.recipient_id,
    actor_id: row.actor_id,
    type: row.type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: row.metadata ?? {},
    read_at: row.read_at,
    created_at: row.created_at,
    actor: actor ?? profile ?? null,
  };
}

export const getNotifications = cache(async function getNotifications(
  limit = NOTIFICATIONS_PAGE_SIZE,
): Promise<NotificationWithActor[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id,
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      metadata,
      read_at,
      created_at,
      actor:profiles!notifications_actor_id_fkey(id, display_name, avatar_url)
    `)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);

  return ((data ?? []) as unknown as NotificationRow[]).map(mapNotification);
});

export const getUnreadNotificationCount = cache(async function getUnreadNotificationCount(): Promise<number> {
  const user = await getAuthUser();
  if (!user) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) throw new Error(`Failed to fetch notification count: ${error.message}`);

  return count ?? 0;
});

export async function createNotification(notification: NotificationInsert): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").insert(notification);

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  validateUUID(notificationId, "notification");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) throw new Error(`Failed to mark notifications as read: ${error.message}`);
}
