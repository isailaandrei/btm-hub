"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteContact, deleteApplication } from "../actions";

interface DeleteContactButtonProps {
  contactId: string;
  contactName: string;
  applicationCount: number;
}

export function DeleteContactButton({
  contactId,
  contactName,
  applicationCount,
}: DeleteContactButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const appWarning =
      applicationCount > 0
        ? `\n\nThis will also delete ${applicationCount} application${applicationCount !== 1 ? "s" : ""}.`
        : "";
    if (
      !confirm(
        `Delete contact "${contactName}" and all associated data?${appWarning}\n\nThis cannot be undone.`,
      )
    )
      return;

    startTransition(async () => {
      try {
        await deleteContact(contactId);
        toast.success(`Contact "${contactName}" deleted.`);
        router.push("/admin");
      } catch {
        toast.error("Failed to delete contact.");
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
      {isPending ? "Deleting..." : "Delete contact"}
    </button>
  );
}

interface DeleteApplicationButtonProps {
  applicationId: string;
  program: string;
}

export function DeleteApplicationButton({
  applicationId,
  program,
}: DeleteApplicationButtonProps) {
  const [isPending, startTransition] = useTransition();

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
      className="text-xs font-medium text-destructive/70 transition-colors hover:text-destructive disabled:opacity-50"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
