import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PortableText } from "@portabletext/react";
import { SanityImage } from "@/components/sanity/SanityImage";
import { portableTextComponents } from "@/lib/sanity/portable-text";
import { getTeamMemberBySlug, getAllTeamMemberSlugs } from "@/lib/data/sanity";
import { isSafeUrl } from "@/lib/validation-helpers";

export async function generateStaticParams() {
  const slugs = await getAllTeamMemberSlugs();
  return (slugs ?? []).map((slug: string) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const member = await getTeamMemberBySlug(slug);
  if (!member) return {};
  return {
    title: `${member.name} — Behind The Mask`,
    description: member.shortBio ?? undefined,
  };
}

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const member = await getTeamMemberBySlug(slug);
  if (!member) return notFound();

  return (
    <div className="min-h-screen bg-muted px-5 py-16 md:px-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 flex flex-col items-center gap-8 md:flex-row md:items-start">
          {member.photo && (
            <div className="relative h-64 w-52 shrink-0 overflow-hidden rounded-xl">
              <SanityImage
                source={member.photo}
                alt={member.photo?.alt || member.name || ""}
                fill
                className="object-cover"
                sizes="208px"
              />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-foreground md:text-4xl">
              {member.name}
            </h1>
            {member.title && (
              <p className="mt-1 text-lg text-primary">{member.title}</p>
            )}
            {member.shortBio && (
              <p className="mt-4 text-muted-foreground">{member.shortBio}</p>
            )}
            {member.specialties && member.specialties.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {member.specialties.map((s: string) => (
                  <span
                    key={s}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {member.socialLinks && member.socialLinks.length > 0 && (
              <div className="mt-4 flex gap-3">
                {member.socialLinks.map(
                  (link: { platform?: string; url?: string }, i: number) => (
                    <a
                      key={i}
                      href={
                        link.url && isSafeUrl(link.url) ? link.url : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground capitalize transition-opacity hover:opacity-75"
                    >
                      {link.platform}
                    </a>
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        {member.fullBio && (
          <section className="mb-12">
            <PortableText
              value={member.fullBio}
              components={portableTextComponents}
            />
          </section>
        )}

        <Link
          href="/team"
          className="text-sm text-primary transition-opacity hover:opacity-75"
        >
          &larr; Back to Team
        </Link>
      </div>
    </div>
  );
}
