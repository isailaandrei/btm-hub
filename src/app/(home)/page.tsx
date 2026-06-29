import type { Metadata } from "next";
import { CollageParallax } from "@/components/home/collage-parallax";
import { HomeAuthProvider } from "@/components/home/home-auth-context";
import { HomeDesktop } from "@/components/home/home-desktop";
import { HomeMobile } from "@/components/home/home-mobile";
import { RevealOnScroll } from "@/components/home/reveal-on-scroll";
import { VideosSection } from "@/components/home/videos-section";
import { Footer } from "@/components/layout/Footer";
import { getHomepageVideos } from "@/lib/data/sanity";

export const metadata: Metadata = {
  title: "Behind The Mask — Life is an Ocean",
  description:
    "We share a deep passion for the ocean and all life connected to it. Academy, community, films, and shop — connecting people to the ocean through learning, stories, and shared passion.",
};

export default async function HomePage() {
  const homepageVideos = await getHomepageVideos();
  const videoItems = homepageVideos.map((video) => ({
    id: video.youtubeId,
    title: video.title,
  }));

  return (
    <HomeAuthProvider>
      <RevealOnScroll />
      <CollageParallax />
      <HomeDesktop />
      <HomeMobile />
      <VideosSection items={videoItems} />
      <Footer />
    </HomeAuthProvider>
  );
}
