"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login, type AuthState } from "../actions";

const initialState: AuthState = { errors: null, message: null };

function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";
  const successMessage = searchParams.get("message");

  return (
    <>
      {successMessage && (
        <div className="mb-6 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-4 py-3 text-sm text-brand-primary">
          {successMessage}
        </div>
      )}

      {state.message && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="redirect" value={redirectTo} />

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
            autoComplete="current-password"
            required
            className="rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary"
            placeholder="••••••••"
          />
          {state.errors?.password && (
            <p className="text-sm text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-brand-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-cyan-blue-gray">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-brand-primary transition-opacity hover:opacity-75"
        >
          Create one
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-2 text-center text-[length:var(--font-size-h1)] font-medium text-white">
        Welcome back
      </h1>
      <p className="mb-8 text-center text-brand-cyan-blue-gray">
        Sign in to your Behind the Mask account
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
