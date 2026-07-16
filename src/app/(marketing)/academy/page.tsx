import type { Metadata } from "next";
import { AcademyCTABand } from "@/components/academy/AcademyCTABand";
import { AcademyPanels } from "@/components/academy/AcademyPanels";
import { AcademyProgramSection } from "@/components/academy/AcademyProgramSection";
import { RevealOnScroll } from "@/components/home/reveal-on-scroll";
import { PROGRAMS } from "@/lib/academy/programs";
import { panelImage, deepDiveImage } from "@/lib/academy/images";
import { getAllProgramsCms, getAcademyPageSettings } from "@/lib/data/sanity";

export const metadata: Metadata = {
  title: "Academy — Behind The Mask",
  description:
    "Mentorship-based programmes in underwater photography, filmmaking, freediving and internships. Apply to train with Behind the Mask.",
};

export default async function AcademyPage() {
  const programs = Object.values(PROGRAMS);
  const [cmsData, settings] = await Promise.all([
    getAllProgramsCms(),
    getAcademyPageSettings(),
  ]);
  const cmsBySlug = new Map(cmsData.map((program) => [program.slug, program]));

  const openBySlug = new Map(
    programs.map((program) => [
      program.slug,
      cmsBySlug.get(program.slug)?.applicationOpen ?? program.applicationOpen,
    ]),
  );

  // The four programmes *are* the hero (see AcademyPanels). Each panel links
  // to that programme's dedicated page; scrolling past the hero reveals the
  // deep-dive preview sections. All display copy + imagery is Sanity-owned —
  // a cleared field renders nothing (no local fallback).
  const panels = programs.map((program) => {
    const cms = cmsBySlug.get(program.slug);
    return {
      slug: program.slug,
      name: cms?.name,
      tag: cms?.tag,
      image: panelImage(cms),
      href: `/academy/${program.slug}`,
      isOpen: openBySlug.get(program.slug) ?? program.applicationOpen,
    };
  });

  // `dark` resolves any shadcn token components to dark; the #020306 base +
  // white type carry the homepage's cinematic language. RevealOnScroll is safe
  // here — every section is static and present at mount.
  return (
    <div className="dark min-h-screen bg-[#020306] text-white">
      <RevealOnScroll />
      <AcademyPanels
        panels={panels}
        eyebrow={settings?.heroEyebrow}
        heading={settings?.heroHeading}
      />

      <div id="programmes">
        {programs.map((program, index) => {
          const cms = cmsBySlug.get(program.slug);

          return (
            <AcademyProgramSection
              key={program.slug}
              index={index}
              slug={program.slug}
              name={cms?.name}
              overline={cms?.overline}
              description={cms?.description}
              highlights={cms?.highlights ?? []}
              applyHref={`/academy/${program.slug}/apply`}
              detailHref={`/academy/${program.slug}`}
              isOpen={openBySlug.get(program.slug) ?? program.applicationOpen}
              image={deepDiveImage(cms)}
            />
          );
        })}
      </div>

      <AcademyCTABand
        backgroundImage={settings?.ctaImage}
        heading={settings?.ctaHeading}
        body={settings?.ctaBody}
        buttonLabel={settings?.ctaButtonLabel}
      />
    </div>
  );
}
