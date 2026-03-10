import { HeroSection } from "@/components/sections/HeroSection";
import { StatsBar } from "@/components/sections/StatsBar";
import { WhatWeDoSection } from "@/components/sections/WhatWeDoSection";
import { ShopSection } from "@/components/sections/ShopSection";
import { AcademySection } from "@/components/sections/AcademySection";
import { CommunitySection } from "@/components/sections/CommunitySection";
import { TestimonialsSection } from "@/components/sections/TestimonialsSection";
import { PartnersSection } from "@/components/sections/PartnersSection";
import { CTABanner } from "@/components/sections/CTABanner";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsBar />
      <WhatWeDoSection />

      {/* Shop/Academy order swaps on mobile: Academy first on mobile, Shop first on desktop */}
      <div className="flex flex-col">
        <div className="order-2 md:order-1">
          <ShopSection />
        </div>
        <div className="order-1 md:order-2">
          <AcademySection />
        </div>
      </div>

      <CommunitySection />
      <TestimonialsSection />
      <PartnersSection />

      <CTABanner
        heading="Come Get Some Ocean Emotion"
        description="Subscribe to our newsletter and never miss an expedition, film release, or ocean story."
        buttonLabel="Subscribe Now"
      />
    </>
  );
}
