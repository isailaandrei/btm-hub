import { SectionHeader } from "@/components/sections/SectionHeader";
import { TestimonialCard } from "@/components/sections/TestimonialCard";

const TESTIMONIALS = [
  {
    quote:
      "The filmmaking mentorship completely transformed how I shoot underwater. Florian's feedback pushed me to a level I didn't think was possible.",
    authorName: "Sarah M.",
    authorDetail: "Filmmaking Program, 2025",
  },
  {
    quote:
      "The community forums are incredible. I've learned more about underwater photography here in 3 months than in years of diving alone.",
    authorName: "Tom K.",
    authorDetail: "Community Member",
  },
  {
    quote:
      "Love the merch quality and the gear guides. Finally a shop run by people who actually dive and know what works.",
    authorName: "Elena R.",
    authorDetail: "Shop Customer",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section className="bg-white px-5 py-12 md:px-24 md:py-24">
      <SectionHeader
        title="Stories From the Deep"
        description="Hear from fellow ocean enthusiasts who have dived with us."
      />
      <div className="mt-8 grid grid-cols-1 gap-8 md:mt-12 md:grid-cols-3 md:gap-8">
        {TESTIMONIALS.map((t) => (
          <TestimonialCard
            key={t.authorName}
            quote={t.quote}
            authorName={t.authorName}
            authorDetail={t.authorDetail}
          />
        ))}
      </div>
    </section>
  );
}
