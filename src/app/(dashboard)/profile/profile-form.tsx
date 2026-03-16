"use client";

import { useActionState } from "react";
import { useState, useEffect } from "react";
import { updateProfile, type ProfileState } from "./actions";
import type { Profile } from "@/types/database";

const initialState: ProfileState = {
  errors: null,
  message: null,
  success: false,
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateProfile,
    initialState,
  );

  // Switch back to view mode when the action returns a successful state.
  // `state` is a new object reference only when the action completes,
  // so this effect fires exactly once per submission — not on re-renders.
  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state]);

  return (
    <section className="rounded-xl border border-brand-secondary bg-brand-near-black p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-base font-medium text-white">
          Personal Information
        </h3>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-brand-cyan-blue-gray transition-opacity hover:opacity-80"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-brand-primary transition-opacity hover:opacity-80"
          >
            Edit
          </button>
        )}
      </div>

      {/* Success toast in view mode */}
      {!editing && state.success && state.message && (
        <div className="mb-5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-4 py-3 text-sm text-brand-primary">
          {state.message}
        </div>
      )}

      {editing ? (
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="displayName"
              className="text-sm font-medium text-brand-light-gray"
            >
              Display Name
              <span className="ml-1 text-brand-primary">*</span>
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

          {state.message && !state.success && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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
      ) : (
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="mb-1 text-xs text-brand-cyan-blue-gray">
              Display Name
            </dt>
            <dd className="text-sm text-white">
              {profile.display_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-brand-cyan-blue-gray">Bio</dt>
            <dd className="whitespace-pre-wrap text-sm text-white">
              {profile.bio || "—"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
