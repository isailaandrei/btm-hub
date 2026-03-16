const STATS = [
  { value: "60K+", label: "Community Members" },
  { value: "30+", label: "Expeditions Planned" },
  { value: "500+", label: "Divers Worldwide" },
  { value: "10+", label: "Years of Ocean Stories" },
] as const;

export function StatsBar() {
  return (
    <section className="bg-primary px-5 py-6 md:px-24 md:py-12">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-0">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1 py-4"
          >
            <span className="text-[length:var(--font-size-h1)] font-bold text-white">
              {stat.value}
            </span>
            <span className="text-sm text-white">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
