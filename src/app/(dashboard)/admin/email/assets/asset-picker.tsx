"use client";

import type { EmailAsset } from "@/types/database";

interface AssetPickerProps {
  assets: EmailAsset[];
  selectedAssetIds: string[];
  onToggleAsset: (assetId: string) => void;
}

export function AssetPicker({
  assets,
  selectedAssetIds,
  onToggleAsset,
}: AssetPickerProps) {
  if (assets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No email assets uploaded yet.
      </div>
    );
  }

  const selected = new Set(selectedAssetIds);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => onToggleAsset(asset.id)}
          className={`overflow-hidden rounded-md border text-left transition-colors ${
            selected.has(asset.id)
              ? "border-primary bg-primary/10"
              : "border-border hover:bg-muted/40"
          }`}
        >
          <img
            src={asset.public_url}
            alt={asset.original_filename}
            className="aspect-video w-full bg-muted object-cover"
          />
          <span className="block truncate px-3 py-2 text-xs text-muted-foreground">
            {asset.original_filename}
          </span>
        </button>
      ))}
    </div>
  );
}
