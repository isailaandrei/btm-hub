"use client";

import { useEffect, useState, useTransition } from "react";
import { PortfolioGallery } from "@/components/profile/portfolio-gallery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfilePortfolioItemWithUrl } from "@/types/database";
import { loadContactPortfolioAction } from "./contact-detail-actions";

/**
 * Client portfolio card for the contact detail panel. Portfolio is the heaviest
 * payload and rarely the reason a contact is opened, so it is kept out of the
 * bootstrap and lazy-loaded here when the panel mounts.
 */
export function PortfolioSectionClient({
  profileId,
}: {
  profileId: string | null;
}) {
  const [items, setItems] = useState<ProfilePortfolioItemWithUrl[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try {
        const result = await loadContactPortfolioAction(profileId);
        if (active) {
          setLoadError(null);
          setItems(result);
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load portfolio.",
          );
        }
      }
    });
    return () => {
      active = false;
    };
  }, [profileId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Portfolio
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : items === null ? (
          <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
        ) : profileId && items.length > 0 ? (
          <PortfolioGallery items={items} compact />
        ) : (
          <p className="text-sm text-muted-foreground">
            No portfolio images linked to this contact.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
