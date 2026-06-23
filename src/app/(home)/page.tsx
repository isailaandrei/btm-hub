import type { Metadata } from "next";
import { HomeDesktop } from "@/components/home/home-desktop";
import { HomeMobile } from "@/components/home/home-mobile";
import { VideosSection } from "@/components/home/videos-section";

export const metadata: Metadata = {
  title: "Behind The Mask — Life is an Ocean",
  description:
    "We share a deep passion for the ocean and all life connected to it. Academy, community, films, and shop — connecting people to the ocean through learning, stories, and shared passion.",
};

export default function HomePage() {
  return (
    <>
      <HomeDesktop />
      <HomeMobile />
      <VideosSection />
    </>
  );
}
