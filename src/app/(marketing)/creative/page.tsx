import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creative — Behind The Mask",
  description: "Our creative studio — coming soon.",
};

// Placeholder for the (TBD) Creative section so the navbar link resolves rather
// than 404s. Dark to match the cinematic direction; redesign when scoped.
export default function CreativePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#020306] px-5 py-20 text-center text-white">
      <h1 className="mb-4 font-display text-4xl">Creative</h1>
      <p className="max-w-md font-serif text-white/70">
        A home for our creative work and collaborations. Coming soon.
      </p>
    </div>
  );
}
