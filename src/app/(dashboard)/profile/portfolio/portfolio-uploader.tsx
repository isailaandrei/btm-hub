"use client";

/* eslint-disable @next/next/no-img-element */

import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import * as tus from "tus-js-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getProfilePortfolioUploadEndpoint,
  isAllowedPortfolioImageType,
  portfolioStoragePath,
  PROFILE_PORTFOLIO_BUCKET,
} from "@/lib/storage/profile-portfolio";
import { createClient } from "@/lib/supabase/client";
import type { ProfilePortfolioItemWithUrl } from "@/types/database";
import {
  createPortfolioItemAction,
  deletePortfolioItemAction,
  updatePortfolioItemAction,
} from "./actions";

type UploadState = {
  id: string;
  fileName: string;
  progress: number;
  error: string | null;
};

export function PortfolioUploader({
  profileId,
  initialItems,
}: {
  profileId: string;
  initialItems: ProfilePortfolioItemWithUrl[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [editing, setEditing] = useState<
    Record<string, { title: string; caption: string }>
  >(() =>
    Object.fromEntries(
      initialItems.map((item) => [
        item.id,
        { title: item.title ?? "", caption: item.caption ?? "" },
      ]),
    ),
  );
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!isAllowedPortfolioImageType(file.type)) {
      toast.error(`${file.name} must be JPEG, PNG, or WebP.`);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error("You must be logged in to upload portfolio images.");
      return;
    }

    const storagePath = portfolioStoragePath(profileId, file.type);
    const uploadId = `${file.name}-${crypto.randomUUID()}`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error("Missing Supabase URL.");
    const endpoint = getProfilePortfolioUploadEndpoint(supabaseUrl);

    setUploads((current) => [
      ...current,
      { id: uploadId, fileName: file.name, progress: 0, error: null },
    ]);

    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${token}`,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          fingerprint() {
            return Promise.resolve(storagePath);
          },
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: PROFILE_PORTFOLIO_BUCKET,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploads((current) =>
        current.map((item) =>
          item.id === uploadId ? { ...item, error: message } : item,
        ),
      );
      throw error;
    }

    await createPortfolioItemAction({
      storagePath,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      title: "",
      caption: "",
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await uploadFile(file);
        toast.success(`${file.name} uploaded.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed.";
        toast.error(message);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function saveItem(itemId: string) {
    const next = editing[itemId] ?? { title: "", caption: "" };
    startTransition(async () => {
      try {
        await updatePortfolioItemAction(itemId, next);
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  title: next.title || null,
                  caption: next.caption || null,
                }
              : item,
          ),
        );
        toast.success("Portfolio item updated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed.");
      }
    });
  }

  function deleteItem(itemId: string) {
    startTransition(async () => {
      try {
        await deletePortfolioItemAction(itemId);
        setItems((current) => current.filter((item) => item.id !== itemId));
        toast.success("Portfolio item deleted.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio images</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Button type="button" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Upload images
          </Button>
        </div>

        {uploads.length > 0 && (
          <div className="flex flex-col gap-2">
            {uploads.map((upload) => (
              <div key={upload.id} className="text-sm text-muted-foreground">
                {upload.fileName}: {upload.error ?? `${upload.progress}%`}
              </div>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Upload JPEG, PNG, or WebP images to build your portfolio.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {item.signedUrl ? (
                    <img
                      src={item.signedUrl}
                      alt={item.title || item.original_filename}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-destructive">
                      {item.imageError ?? "Image unavailable."}
                    </div>
                  )}
                </div>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Title</span>
                  <input
                    value={editing[item.id]?.title ?? ""}
                    onChange={(event) =>
                      setEditing((current) => ({
                        ...current,
                        [item.id]: {
                          title: event.target.value,
                          caption: current[item.id]?.caption ?? "",
                        },
                      }))
                    }
                    className="rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Caption</span>
                  <textarea
                    value={editing[item.id]?.caption ?? ""}
                    onChange={(event) =>
                      setEditing((current) => ({
                        ...current,
                        [item.id]: {
                          title: current[item.id]?.title ?? "",
                          caption: event.target.value,
                        },
                      }))
                    }
                    className="min-h-20 rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveItem(item.id)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteItem(item.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
