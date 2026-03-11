"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type AuthState } from "../actions";

const initialState: AuthState = { errors: null, message: null };

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(register, initialState);

  return (
    <>
      <h1 className="mb-2 text-center text-[length:var(--font-size-h1)] font-medium text-white">
        Join the community
      </h1>
      <p className="mb-8 text-center text-brand-cyan-blue-gray">
        Create your Behind the Mask account
      </p>

      {state.message && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

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
            autoComplete="name"
            required
            className="rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
            placeholder="How you want to be known"
          />
          {state.errors?.displayName && (
            <p className="text-sm text-red-400">
              {state.errors.displayName[0]}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="email"
            className="text-sm font-medium text-brand-light-gray"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
            placeholder="you@example.com"
          />
          {state.errors?.email && (
            <p className="text-sm text-red-400">{state.errors.email[0]}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="password"
            className="text-sm font-medium text-brand-light-gray"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
            placeholder="Min 8 chars, uppercase, lowercase, number"
          />
          {state.errors?.password && (
            <p className="text-sm text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="confirmPassword"
            className="text-sm font-medium text-brand-light-gray"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
            placeholder="Repeat your password"
          />
          {state.errors?.confirmPassword && (
            <p className="text-sm text-red-400">
              {state.errors.confirmPassword[0]}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-brand-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-cyan-blue-gray">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand-primary transition-opacity hover:opacity-75"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
