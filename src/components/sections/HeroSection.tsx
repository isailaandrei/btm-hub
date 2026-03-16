import Link from "next/link";
import { BrandButton } from "@/components/ui/BrandButton";

export function HeroSection() {
  return (
    <section className="relative bg-neutral-900 px-5 py-20 text-center md:px-24 md:py-40">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex flex-col items-center gap-5 md:gap-6">
        <h1 className="text-4xl font-bold text-white md:text-7xl">
          Life is an Ocean
        </h1>
        <p className="max-w-2xl text-base text-neutral-300 md:text-xl">
          The magic happens down there. We observe, listen, and document —
          learn, create, and connect through our academy, shop, and community.
        </p>
        <div className="flex w-full flex-col items-center gap-3 md:w-auto md:flex-row md:gap-4">
          <BrandButton variant="primary" className="w-full md:w-auto">
            Join the Community
          </BrandButton>
          <Link href="/academy" className="w-full md:w-auto">
            <BrandButton variant="ghost" className="w-full">
              Explore Academy
            </BrandButton>
          </Link>
        </div>
      </div>
    </section>
  );
}
