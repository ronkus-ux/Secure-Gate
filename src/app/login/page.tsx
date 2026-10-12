import type { Metadata } from "next";

import AuthScreen from "@/components/auth/AuthScreen";

// This route is just the "login" mode of the one auth screen. The form itself,
// and the rules for what it shows, live in src/components/auth.
export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
