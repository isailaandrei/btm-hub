import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <>
      <h1 className="mb-8 text-[length:var(--font-size-h1)] font-medium text-white">
        Profile
      </h1>

      <div className="flex flex-col gap-6">
        {/* Editable section */}
        <ProfileForm profile={profile} />

        {/* Read-only account details */}
        <section className="rounded-xl border border-brand-secondary bg-brand-near-black p-6">
          <h3 className="mb-5 text-base font-medium text-white">Account</h3>
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="mb-1 text-xs text-brand-cyan-blue-gray">Email</dt>
              <dd className="text-sm text-white">{profile.email}</dd>
            </div>
            <div>
              <dt className="mb-1 text-xs text-brand-cyan-blue-gray">Role</dt>
              <dd className="text-sm capitalize text-white">{profile.role}</dd>
            </div>
            <div>
              <dt className="mb-1 text-xs text-brand-cyan-blue-gray">
                Account Created
              </dt>
              <dd className="text-sm text-white">
                {new Date(profile.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs text-brand-cyan-blue-gray">
                Last Updated
              </dt>
              <dd className="text-sm text-white">
                {new Date(profile.updated_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
