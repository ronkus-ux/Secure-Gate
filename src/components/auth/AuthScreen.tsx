"use client";

import { Suspense } from "react";

import AuthShell from "@/components/ui/AuthShell";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import ForgotPasswordForm from "./ForgotPasswordForm";

// ---------------------------------------------------------------------------
// AuthScreen - the single authentication screen.
//
// /login, /register and /forgot-password are the same screen. Each route is a
// thin wrapper that renders <AuthScreen mode="..." />, which picks which of the
// three forms to show. Only one form is ever mounted, so the three forms are
// never duplicated in the tree - they are conditionally rendered from here, and
// the shared shell (AuthShell) is rendered once.
//
// Suspense is required because LoginForm reads the query string
// (useSearchParams), which Next.js needs a boundary around during prerender.
// ---------------------------------------------------------------------------
export type AuthMode = "login" | "register" | "forgot";

const TITLES: Record<AuthMode, string> = {
  login: "Sign in",
  register: "Create your account",
  forgot: "Forgot your password?",
};

export default function AuthScreen({ mode }: { mode: AuthMode }) {
  return (
    <AuthShell title={TITLES[mode]}>
      <Suspense fallback={null}>
        {mode === "login" && <LoginForm />}
        {mode === "register" && <RegisterForm />}
        {mode === "forgot" && <ForgotPasswordForm />}
      </Suspense>
    </AuthShell>
  );
}
