"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type AuthState } from "../actions";

const initialState: AuthState = { errors: null, message: null };

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(register, initialState);

  return (
    <>
      <h1 className="mb-2 text-center text-[length:var(--font-size-h1)] font-medium text-foreground">
        Join the community
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        Create your Behind the Mask account
      </p>

      {state.message && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="displayName"
            className="text-sm font-medium text-muted-foreground"
          >
            Display Name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            defaultValue={state.values?.displayName}
            className={`rounded-lg border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary ${state.errors?.displayName ? "border-destructive" : "border-border"}`}
          />
          {state.errors?.displayName && (
            <p className="text-sm text-destructive">{state.errors.displayName}</p>
          )}
        </div>

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
            autoComplete="new-password"
            required
            className={`rounded-lg border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary ${state.errors?.password ? "border-destructive" : "border-border"}`}
          />
          {state.errors?.password && (
            <p className="text-sm text-destructive">{state.errors.password}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="confirmPassword"
            className="text-sm font-medium text-muted-foreground"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className={`rounded-lg border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary ${state.errors?.confirmPassword ? "border-destructive" : "border-border"}`}
          />
          {state.errors?.confirmPassword && (
            <p className="text-sm text-destructive">{state.errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-primary transition-opacity hover:opacity-75"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
