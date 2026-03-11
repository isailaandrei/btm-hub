"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./actions";
import type { Profile } from "@/types/database";

const initialState: ProfileState = {
  errors: null,
  message: null,
  success: false,
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, isPending] = useActionState(
    updateProfile,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="displayName"
          className="text-sm font-medium text-brand-light-gray"
        >
          Display Name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          defaultValue={profile.display_name || ""}
          className="rounded-lg border border-brand-secondary bg-brand-background px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
        />
        {state.errors?.displayName && (
          <p className="text-sm text-red-400">
            {state.errors.displayName[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="bio"
          className="text-sm font-medium text-brand-light-gray"
        >
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={profile.bio || ""}
          className="resize-none rounded-lg border border-brand-secondary bg-brand-background px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
          placeholder="Tell the community about yourself — what's your connection to the ocean?"
        />
        {state.errors?.bio && (
          <p className="text-sm text-red-400">{state.errors.bio[0]}</p>
        )}
        <p className="text-xs text-brand-light-gray">Max 500 characters</p>
      </div>

      {state.message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            state.success
              ? "border-brand-primary/30 bg-brand-primary/10 text-brand-primary"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-brand-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
