import Link from "next/link";
import type { Metadata } from "next";
import { SanityImage } from "@/components/sanity/SanityImage";
import { getTeamMembers } from "@/lib/data/sanity";
import { isSafeUrl } from "@/lib/validation-helpers";

export const metadata: Metadata = {
  title: "Team — Behind The Mask",
  description: "Meet the people behind Behind The Mask.",
};

const ROLE_ORDER = ["founder", "instructor", "guide"] as const;
const ROLE_LABELS: Record<string, string> = {
  founder: "Founders",
  instructor: "Instructors",
  guide: "Guides",
};

export default async function TeamPage() {
  const members = await getTeamMembers();

  if (!members || members.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
        <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
          Our Team
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Team profiles are coming soon.
        </p>
      </div>
    );
  }

  const grouped = ROLE_ORDER
    .map((role) => ({
      role,
      label: ROLE_LABELS[role] ?? role,
      members: members.filter((m) => m.role === role),
    }))
    .filter((g) => g.members.length > 0);

  const ungrouped = members.filter(
    (m) =>
      !m.role || !ROLE_ORDER.includes(m.role as (typeof ROLE_ORDER)[number]),
  );

  return (
    <div className="min-h-screen bg-muted px-5 py-16 md:px-24">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-center text-[length:var(--font-size-h1)] font-medium text-foreground">
          Our Team
        </h1>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          The people behind Behind The Mask — ocean enthusiasts, creatives, and
          explorers.
        </p>

        {grouped.map((group) => (
          <TeamSection
            key={group.role}
            label={group.label}
            members={group.members}
          />
        ))}

        {ungrouped.length > 0 && (
          <TeamSection label="Other" members={ungrouped} />
        )}
      </div>
    </div>
  );
}

function TeamSection({
  label,
  members,
}: {
  label: string;
  members: Awaited<ReturnType<typeof getTeamMembers>>;
}) {
  return (
    <section className="mb-16">
      <h2 className="mb-8 text-2xl font-bold text-foreground">{label}</h2>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {members.filter((m) => m.slug?.current).map((member) => (
          <Link
            key={member._id}
            href={`/team/${member.slug!.current}`}
            className="overflow-hidden rounded-xl bg-background shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <SanityImage
                source={member.photo}
                alt={member.photo?.alt || member.name || ""}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              />
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-foreground">
                {member.name}
              </h3>
              {member.title && (
                <p className="text-sm text-primary">{member.title}</p>
              )}
              {member.shortBio && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {member.shortBio}
                </p>
              )}
              {member.socialLinks && member.socialLinks.length > 0 && (
                <div className="mt-3 flex gap-3">
                  {member.socialLinks.map(
                    (
                      link: { platform?: string; url?: string },
                      i: number,
                    ) => (
                      <a
                        key={i}
                        href={
                          link.url && isSafeUrl(link.url)
                            ? link.url
                            : "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground capitalize transition-opacity hover:opacity-75"
                      >
                        {link.platform}
                      </a>
                    ),
                  )}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
