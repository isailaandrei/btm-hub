"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login, type AuthState } from "../actions";

const initialState: AuthState = { errors: null, message: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";

  const MESSAGE_MAP: Record<string, string> = {
    "email-confirmation": "Check your email to confirm your account.",
    "password-reset": "Check your email for a password reset link.",
  };
  const successMessage = MESSAGE_MAP[searchParams.get("message") ?? ""];

  return (
    <>
      <h1 className="mb-2 text-center text-[length:var(--font-size-h1)] font-medium text-foreground">
        Welcome back
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        Sign in to your Behind the Mask account
      </p>

      {successMessage && (
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {successMessage}
        </div>
      )}

      {state.message && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="redirect" value={redirectTo} />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="email"
            className="text-sm font-medium text-muted-foreground"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values?.email}
            className={`rounded-lg border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary ${state.errors?.email ? "border-destructive" : "border-border"}`}
          />
          {state.errors?.email && (
            <p className="text-sm text-destructive">{state.errors.email}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="password"
            className="text-sm font-medium text-muted-foreground"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue={state.values?.password}
            className={`rounded-lg border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary ${state.errors?.password ? "border-destructive" : "border-border"}`}
          />
          {state.errors?.password && (
            <p className="text-sm text-destructive">{state.errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-primary transition-opacity hover:opacity-75"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
