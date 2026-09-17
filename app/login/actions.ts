"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "");
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to sign in." };
  }
  redirect(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
