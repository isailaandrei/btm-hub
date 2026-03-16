import { RoundedButton } from "@/components/ui/RoundedButton";

export function ShopSection() {
  return (
    <section className="bg-muted px-5 py-12 md:px-24 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-16 lg:gap-24">
        {/* Image placeholder */}
        <div className="aspect-[540/380] w-full rounded-xl bg-muted-foreground md:w-1/2" />

        {/* Text content */}
        <div className="flex flex-col gap-5 md:w-1/2">
          <h2 className="text-[length:var(--font-size-h1)] font-bold text-foreground">
            The Ocean Shop
          </h2>
          <p className="text-lg text-muted-foreground">
            Represent the ocean community. Browse our collection of merchandise,
            digital products, and hand-picked gear guides curated by our
            filmmakers and divers.
          </p>
          <div>
            <RoundedButton variant="primary">Browse Shop</RoundedButton>
          </div>
        </div>
      </div>
    </section>
  );
}
