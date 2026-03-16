import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-5 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-48 w-full animate-pulse rounded-lg bg-card" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
