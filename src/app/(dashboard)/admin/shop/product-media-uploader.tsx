"use client";

import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import * as tus from "tus-js-client";
import { Button } from "@/components/ui/button";
import type { ShopProductWithVariants } from "@/lib/shop/types";
import {
  getShopProductMediaUploadEndpoint,
  isAllowedShopProductMediaType,
  MAX_SHOP_PRODUCT_MEDIA_BYTES,
  SHOP_PRODUCT_MEDIA_BUCKET,
  shopProductMediaStoragePath,
} from "@/lib/storage/shop-product-media";
import { createClient } from "@/lib/supabase/client";
import {
  deleteShopProductMediaAction,
  recordShopProductMediaAction,
} from "./actions";

interface UploadState {
  id: string;
  fileName: string;
  progress: number;
  error: string | null;
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number | null; height: number | null }>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    image.src = url;
  });
}

export function ProductMediaUploader({
  product,
  onSaved,
}: {
  product: ShopProductWithVariants;
  onSaved: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isPending, startTransition] = useTransition();

  async function uploadFile(file: File, sortOffset: number) {
    if (!isAllowedShopProductMediaType(file.type)) {
      throw new Error(`${file.name} must be JPEG, PNG, or WebP.`);
    }
    if (file.size > MAX_SHOP_PRODUCT_MEDIA_BYTES) {
      throw new Error(`${file.name} is larger than 10 MB.`);
    }

    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You must be logged in as an admin to upload product images.");

    const storagePath = shopProductMediaStoragePath(product.id, file.type);
    const uploadId = `${file.name}-${crypto.randomUUID()}`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error("Missing Supabase URL.");

    setUploads((current) => [
      ...current,
      { id: uploadId, fileName: file.name, progress: 0, error: null },
    ]);

    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: getShopProductMediaUploadEndpoint(supabaseUrl),
          retryDelays: [0, 3000, 5000, 10000],
          headers: { authorization: `Bearer ${token}` },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          fingerprint() {
            return Promise.resolve(storagePath);
          },
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: SHOP_PRODUCT_MEDIA_BUCKET,
            objectName: storagePath,
            contentType: file.type,
            cacheControl: "3600",
          },
          onError(error) {
            reject(error);
          },
          onProgress(bytesUploaded, bytesTotal) {
            const progress =
              bytesTotal > 0
                ? Math.round((bytesUploaded / bytesTotal) * 100)
                : 0;
            setUploads((current) =>
              current.map((item) =>
                item.id === uploadId ? { ...item, progress } : item,
              ),
            );
          },
          onSuccess() {
            resolve();
          },
        });
        upload.start();
      });

      const { data: publicUrlData } = supabase.storage
        .from(SHOP_PRODUCT_MEDIA_BUCKET)
        .getPublicUrl(storagePath);
      const dimensions = await readImageDimensions(file);

      await recordShopProductMediaAction({
        productId: product.id,
        storagePath,
        publicUrl: publicUrlData.publicUrl,
        altText: product.title,
        caption: "",
        mimeType: file.type,
        sizeBytes: file.size,
        width: dimensions.width,
        height: dimensions.height,
        isPrimary: product.media.length === 0 && sortOffset === 0,
        sortOrder: product.media.length + sortOffset,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploads((current) =>
        current.map((item) =>
          item.id === uploadId ? { ...item, error: message } : item,
        ),
      );
      await supabase.storage.from(SHOP_PRODUCT_MEDIA_BUCKET).remove([storagePath]);
      throw error;
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    for (const [index, file] of selected.entries()) {
      try {
        await uploadFile(file, index);
        toast.success(`${file.name} uploaded.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    await onSaved();
  }

  function deleteMedia(mediaId: string) {
    startTransition(async () => {
      try {
        await deleteShopProductMediaAction(mediaId);
        await onSaved();
        toast.success("Product image deleted.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed.");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-foreground">Media</h2>
          <p className="text-sm text-muted-foreground">
            Upload JPEG, PNG, or WebP images up to 10 MB.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          Upload
        </Button>
      </div>

      {uploads.length > 0 ? (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <div key={upload.id} className="text-sm text-muted-foreground">
              {upload.fileName}: {upload.error ?? `${upload.progress}%`}
            </div>
          ))}
        </div>
      ) : null}

      {product.media.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          <div className="space-y-2">
            <ImageIcon className="mx-auto size-5" />
            <p>No product images yet.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {product.media.map((media) => (
            <div key={media.id} className="rounded-lg border border-border p-3">
              <div className="aspect-square overflow-hidden rounded-md bg-muted">
                <Image
                  src={media.public_url}
                  alt={media.alt_text || product.title}
                  width={media.width ?? 600}
                  height={media.height ?? 600}
                  unoptimized
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-foreground">
                    {media.is_primary ? "Primary image" : "Product image"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {media.mime_type} · {Math.round(media.size_bytes / 1024)} KB
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => deleteMedia(media.id)}
                  aria-label="Delete product image"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
