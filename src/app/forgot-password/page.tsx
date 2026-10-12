import type { Metadata } from "next";

import AuthScreen from "@/components/auth/AuthScreen";

// This route is just the "forgot" mode of the one auth screen. The form itself,
// and the rules for what it shows, live in src/components/auth.
export const metadata: Metadata = {
  title: "Forgot your password?",
};

export default function ForgotPasswordPage() {
  return <AuthScreen mode="forgot" />;
}
