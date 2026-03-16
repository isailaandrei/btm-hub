import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { ProfileForm } from "./profile-form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

export default async function ProfilePage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <>
      <h1 className="mb-8 text-[length:var(--font-size-h1)] font-medium text-foreground">
        Profile
      </h1>

      <div className="flex flex-col gap-6">
        {/* Editable section */}
        <ProfileForm profile={profile} />

        {/* Read-only account details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-4">
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">Email</dt>
                <dd className="text-sm text-foreground">{profile.email}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">Role</dt>
                <dd className="text-sm capitalize text-foreground">{profile.role}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">
                  Account Created
                </dt>
                <dd className="text-sm text-foreground">
                  {new Date(profile.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">
                  Last Updated
                </dt>
                <dd className="text-sm text-foreground">
                  {new Date(profile.updated_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
