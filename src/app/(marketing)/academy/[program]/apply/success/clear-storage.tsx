"use client";

import { useEffect } from "react";

export function ClearFormStorage({ programSlug }: { programSlug: string }) {
  useEffect(() => {
    localStorage.removeItem(`btm-application-${programSlug}`);
  }, [programSlug]);

  return null;
}
