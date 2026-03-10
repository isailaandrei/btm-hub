import { Button } from "@/components/ui/Button";

export function HeroSection() {
  return (
    <section className="relative bg-brand-secondary px-5 py-20 text-center md:px-24 md:py-40">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex flex-col items-center gap-5 md:gap-6">
        <h1 className="text-4xl font-bold text-white md:text-7xl">
          Life is an Ocean
        </h1>
        <p className="max-w-2xl text-base text-brand-light-gray md:text-xl">
          The magic happens down there. We observe, listen, and document —
          learn, create, and connect through our academy, shop, and community.
        </p>
        <div className="flex w-full flex-col items-center gap-3 md:w-auto md:flex-row md:gap-4">
          <Button variant="primary" className="w-full md:w-auto">
            Join the Community
          </Button>
          <Button variant="ghost" className="w-full md:w-auto">
            Explore Academy
          </Button>
        </div>
      </div>
    </section>
  );
}
