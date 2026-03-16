"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Spinner } from "@/components/ui/spinner";
import { uploadAvatar } from "./actions";

interface AvatarUploadProps {
  currentAvatarUrl: string | null;
  displayName: string | null;
}

export function AvatarUpload({
  currentAvatarUrl,
  displayName,
}: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = (displayName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.append("avatar", file);

    startTransition(async () => {
      const result = await uploadAvatar(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        setAvatarUrl(result.url);
        window.dispatchEvent(new Event("profile-updated"));
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-border transition-colors hover:border-primary"
        disabled={isPending}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName || "Avatar"}
            width={96}
            height={96}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-accent text-xl font-medium text-primary">
            {initials}
          </div>
        )}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${isPending ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          {isPending ? (
            <Spinner className="border-white/30 border-t-white" />
          ) : (
            <span className="text-xs font-medium text-white">Change</span>
          )}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
