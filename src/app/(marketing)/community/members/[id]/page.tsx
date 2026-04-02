import { notFound } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { getAuthUser } from "@/lib/data/auth";
import { getProfileById } from "@/lib/data/profiles";
import { UserAvatar } from "@/components/community/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isUUID } from "@/lib/validation-helpers";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isUUID(id)) notFound();

  const [user, profile] = await Promise.all([
    getAuthUser(),
    getProfileById(id),
  ]);

  if (!profile) notFound();

  const isOwnProfile = user?.id === profile.id;
  const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-6">
          <UserAvatar
            name={profile.display_name}
            avatarUrl={profile.avatar_url}
            size="lg"
            className="h-20 w-20 text-2xl"
          />

          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">
              {profile.display_name || "Community Member"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Member since {memberSince}
            </p>
          </div>

          {profile.bio && (
            <p className="max-w-sm text-center text-sm text-foreground">
              {profile.bio}
            </p>
          )}

          {user && !isOwnProfile && (
            <Button asChild className="mt-2 gap-2">
              <Link href={`/community/messages?start=${profile.id}`}>
                <MessageSquare className="h-4 w-4" />
                Send Message
              </Link>
            </Button>
          )}

          {isOwnProfile && (
            <Button asChild variant="outline" className="mt-2">
              <Link href="/profile">Edit Profile</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
