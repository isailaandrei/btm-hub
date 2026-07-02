import type { Metadata } from "next";
import { Inter, Zilla_Slab } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Closest free substitute for the Figma's "American Typewriter" display face,
// used for headings + the homepage nav. Swap the family here to change it globally.
const zillaSlab = Zilla_Slab({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  // Resolve relative OG/canonical URLs against the deployment's own origin.
  // Off Vercel there is no implicit VERCEL_URL fallback, so set it explicitly
  // from NEXT_PUBLIC_SITE_URL (baked at build); localhost is the dev default.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Behind The Mask — Ocean Community Hub",
  description:
    "A community platform for ocean and diving enthusiasts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${zillaSlab.variable}`}>
      <body className="antialiased">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
