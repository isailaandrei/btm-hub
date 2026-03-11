import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { ProfileForm } from "./profile-form";
import { AvatarUpload } from "./avatar-upload";

export default async function ProfilePage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 text-[length:var(--font-size-h1)] font-medium text-white">
        Your Profile
      </h1>

      <div className="rounded-xl border border-brand-secondary bg-brand-near-black p-6 md:p-8">
        <div className="mb-8 flex flex-col items-center gap-4 border-b border-brand-secondary pb-8 sm:flex-row sm:items-start">
          <AvatarUpload
            currentAvatarUrl={profile.avatar_url}
            displayName={profile.display_name}
          />
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-medium text-white">
              {profile.display_name || "Ocean Explorer"}
            </h2>
            <p className="text-sm text-brand-cyan-blue-gray">
              {profile.email}
            </p>
            <p className="mt-1 text-xs text-brand-light-gray">
              Member since{" "}
              {new Date(profile.created_at).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
