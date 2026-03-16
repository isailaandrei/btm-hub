import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { ProfileSidebar } from "./profile-sidebar";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <ProfileSidebar profile={profile} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
