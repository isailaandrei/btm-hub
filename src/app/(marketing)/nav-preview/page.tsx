import { SiteMenuPoc } from "@/components/nav/poc/site-menu-poc";

/**
 * Temporary preview route for the navbar proof-of-concept. Visit /nav-preview
 * and open the menu to see the full-screen, 3-level sitemap layout on desktop
 * and mobile. Throwaway — delete once the design direction is decided.
 */
export default function NavPreviewPage() {
  return (
    <section className="grid min-h-[80vh] place-items-center bg-[#020306] px-6 text-center text-white">
      <div className="flex max-w-md flex-col items-center gap-6">
        <h1 className="font-display text-3xl">Navbar POC</h1>
        <p className="text-sm text-white/55">
          Full-screen sitemap menu showing the 3-level hierarchy (e.g. Academy →
          Experiences → trips). Placeholder content; links go nowhere.
        </p>
        <SiteMenuPoc />
      </div>
    </section>
  );
}
