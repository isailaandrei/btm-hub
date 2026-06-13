import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { getUnreadNotificationCount } from "@/lib/data/notifications";
import { ProfileSidebar } from "./profile-sidebar";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, unreadNotifications] = await Promise.all([
    getProfile(),
    getUnreadNotificationCount(),
  ]);

  if (!profile) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <ProfileSidebar
          profile={profile}
          unreadNotifications={unreadNotifications}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
