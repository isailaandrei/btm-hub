import Link from "next/link";
import type { Metadata } from "next";
import { PortableText } from "@portabletext/react";
import { SanityImage } from "@/components/sanity/SanityImage";
import { portableTextComponents } from "@/lib/sanity/portable-text";
import { getPartners, type Partner } from "@/lib/data/sanity";

export const metadata: Metadata = {
  title: "Partners — Behind The Mask",
  description:
    "Organizations and brands we collaborate with to protect our oceans.",
};

const TIER_ORDER = ["platinum", "gold", "silver", "community"] as const;
const TIER_LABELS: Record<string, string> = {
  platinum: "Platinum Partners",
  gold: "Gold Partners",
  silver: "Silver Partners",
  community: "Community Partners",
};

export default async function PartnersPage() {
  const partners = await getPartners();

  if (!partners || partners.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
        <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
          Partners
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Organizations and brands we collaborate with to protect our oceans.
          Coming soon.
        </p>
      </div>
    );
  }

  const grouped = TIER_ORDER
    .map((tier) => ({
      tier,
      label: TIER_LABELS[tier] ?? tier,
      partners: partners.filter((p) => p.tier === tier),
    }))
    .filter((g) => g.partners.length > 0);

  const ungrouped = partners.filter(
    (p) => !p.tier || !TIER_ORDER.includes(p.tier as (typeof TIER_ORDER)[number]),
  );

  return (
    <div className="min-h-screen bg-muted px-5 py-16 md:px-24">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-center text-[length:var(--font-size-h1)] font-medium text-foreground">
          Partners
        </h1>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          Organizations and brands we collaborate with to protect our oceans.
        </p>

        {grouped.map((group) => (
          <section key={group.tier} className="mb-12">
            <h2 className="mb-6 text-xl font-bold text-foreground">
              {group.label}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {group.partners.map((partner) => (
                <PartnerCard key={partner._id} partner={partner} />
              ))}
            </div>
          </section>
        ))}

        {ungrouped.length > 0 && (
          <section className="mb-12">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ungrouped.map((partner) => (
                <PartnerCard key={partner._id} partner={partner} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
  return (
    <div className="flex flex-col rounded-xl bg-background p-6 shadow-sm">
      {partner.logo && (
        <div className="mb-4 flex h-16 items-center">
          <SanityImage
            source={partner.logo}
            alt={partner.logo.alt || partner.name || ""}
            width={200}
            height={64}
            className="max-h-16 w-auto object-contain"
          />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">
        {partner.name}
      </h3>
      {partner.shortDescription && (
        <p className="mt-1 text-sm text-muted-foreground">
          {partner.shortDescription}
        </p>
      )}
      {partner.description && (
        <div className="mt-2 text-sm">
          <PortableText
            value={partner.description}
            components={portableTextComponents}
          />
        </div>
      )}
      {partner.memberDiscount && (
        <p className="mt-3 text-sm font-medium text-primary">
          {partner.memberDiscount}
        </p>
      )}
      <div className="mt-auto pt-4">
        {partner.website && (
          <Link
            href={partner.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary transition-opacity hover:opacity-75"
          >
            Visit Website &rarr;
          </Link>
        )}
      </div>
    </div>
  );
}
