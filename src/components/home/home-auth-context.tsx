"use client";

import { createContext, useContext } from "react";
import { useNavbarAuth } from "@/components/layout/use-navbar-auth";
import type { NavbarUser } from "@/lib/data/auth";

/**
 * Shares a single navbar-auth subscription across the homepage's two nav
 * presentations (the pixel-faithful desktop canvas and the mobile header),
 * both of which are mounted at once behind responsive `display` toggles.
 * Without this they would each open their own Supabase auth subscription and
 * fetch the profile twice.
 */

type HomeAuthValue = { user: NavbarUser; loading: boolean };

const HomeAuthContext = createContext<HomeAuthValue | null>(null);

export function HomeAuthProvider({ children }: { children: React.ReactNode }) {
  const value = useNavbarAuth();
  return <HomeAuthContext.Provider value={value}>{children}</HomeAuthContext.Provider>;
}

export function useHomeAuth(): HomeAuthValue {
  const ctx = useContext(HomeAuthContext);
  if (!ctx) {
    // Fail loud: a homepage nav cluster rendered outside its provider is a bug.
    throw new Error("useHomeAuth must be used within <HomeAuthProvider>");
  }
  return ctx;
}
