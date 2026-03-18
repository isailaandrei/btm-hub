const PARTNERS = ["PanOcean", "DiveAssure", "Better Oceans", "Dive Advice Travel"];

export function PartnersSection() {
  return (
    <section className="bg-muted px-5 py-10 md:px-20 md:py-16">
      <h3 className="text-center text-[length:var(--font-size-h3)] font-semibold text-muted-foreground">
        Trusted Partners
      </h3>
      <div className="mt-5 grid grid-cols-2 gap-4 md:mt-8 md:grid-cols-4 md:gap-12">
        {PARTNERS.map((name) => (
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
