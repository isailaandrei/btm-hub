import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SanityLive } from "@/lib/sanity/live";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Behind The Mask — Ocean Community Hub",
  description:
    "A community platform for ocean and diving enthusiasts.",
};

async function isDraftMode() {
  try {
    return (await draftMode()).isEnabled;
  } catch {
    return false;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const draft = await isDraftMode();

  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster />
        <SanityLive />
        {draft && <VisualEditing />}
      </body>
    </html>
  );
}
