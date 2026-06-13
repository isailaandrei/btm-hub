"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteApplication } from "../actions";

interface DeleteApplicationButtonProps {
  applicationId: string;
  program: string;
}

export function DeleteApplicationButton({
  applicationId,
  program,
}: DeleteApplicationButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (
      !confirm(
        `Delete this ${program} application?\n\nThis cannot be undone.`,
      )
    )
      return;

    startTransition(async () => {
      try {
        await deleteApplication(applicationId);
        router.refresh();
        toast.success(`${program} application deleted.`);
      } catch {
        toast.error("Failed to delete application.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="rounded-lg border border-destructive/60 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
    >
      {isPending ? "Deleting..." : "Delete Application"}
    </button>
  );
}
