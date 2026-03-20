import { SanityImage } from "@/components/sanity/SanityImage";
import type { FeaturedPartner } from "@/lib/data/sanity";

const FALLBACK_PARTNERS = [
  "PanOcean",
  "DiveAssure",
  "Better Oceans",
  "Dive Advice Travel",
];

export function PartnersSection({
  partners,
}: {
  partners?: FeaturedPartner[] | null;
}) {
  const hasCmsPartners = partners && partners.length > 0;

  return (
    <section className="bg-muted px-5 py-10 md:px-20 md:py-16">
      <h3 className="text-center text-[length:var(--font-size-h3)] font-semibold text-muted-foreground">
        Trusted Partners
      </h3>
      <div className="mt-5 grid grid-cols-2 gap-4 md:mt-8 md:grid-cols-4 md:gap-12">
        {hasCmsPartners
          ? partners.map((partner) => (
              <div
                key={partner._id}
                className="flex h-[60px] items-center justify-center rounded-lg bg-background"
              >
                {partner.logo ? (
                  <SanityImage
                    source={partner.logo}
                    alt={partner.name || ""}
                    width={160}
                    height={48}
                    className="max-h-12 w-auto object-contain"
                  />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {partner.name}
                  </span>
                )}
              </div>
            ))
          : FALLBACK_PARTNERS.map((name) => (
              <div
                key={name}
                className="flex h-[60px] items-center justify-center rounded-lg bg-background"
              >
                <span className="text-sm font-semibold text-muted-foreground">
                  {name}
                </span>
              </div>
            ))}
      </div>
    </section>
  );
}
