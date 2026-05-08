import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNotifications } from "@/lib/data/notifications";
import {
  getNotificationHref,
  getNotificationText,
} from "@/lib/notifications/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

export default async function ProfileNotificationsPage() {
  const notifications = await getNotifications();
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
          Notifications
        </h1>
        {unreadCount > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No notifications yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((notification) => {
            const unread = !notification.read_at;
            return (
              <Card
                key={notification.id}
                className={unread ? "bg-primary/5 ring-primary/20" : undefined}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={getNotificationHref(notification)}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {getNotificationText(notification)}
                      </p>
                      {unread ? <Badge>New</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </Link>
                  {unread ? (
                    <form action={markNotificationReadAction}>
                      <input
                        type="hidden"
                        name="notificationId"
                        value={notification.id}
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        Mark read
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
