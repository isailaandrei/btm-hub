"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

export type AuthState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  values?: Record<string, string>;
};

export async function login(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null, values: raw };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        errors: null,
        message:
          "Please confirm your email before logging in. Check your inbox for the confirmation link.",
        values: { email: raw.email },
      };
    }
    return {
      errors: null,
      message: "Invalid email or password. Please try again.",
      values: { email: raw.email },
    };
  }

  // Validate redirect is a safe relative path (prevent open redirect attacks)
  const rawRedirect = formData.get("redirect") as string;
  const safePath =
    rawRedirect?.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/profile";
  redirect(safePath);
}

export async function register(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
    displayName: formData.get("displayName") as string,
  };

  const safeValues = { displayName: raw.displayName, email: raw.email };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null, values: safeValues };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.displayName,
      },
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return {
        errors: null,
        message: "An account with this email already exists.",
        values: safeValues,
      };
    }
    return { errors: null, message: "Something went wrong. Please try again.", values: safeValues };
  }

  redirect("/login?message=email-confirmation");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
