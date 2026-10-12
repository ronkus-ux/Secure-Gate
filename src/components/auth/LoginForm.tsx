"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

import TextField from "@/components/ui/TextField";
import SubmitButton from "@/components/ui/SubmitButton";
import FormAlert from "@/components/ui/FormAlert";

// ---------------------------------------------------------------------------
// LoginForm - one of the three forms the single auth screen can show.
//
// The forms live here (in components/auth) rather than one-per-route, so that
// /login, /register and /forgot-password are the same screen with a different
// "mode". AuthScreen owns the shell and picks which form to mount; this file
// only contains the form itself.
// ---------------------------------------------------------------------------
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const justRegistered = searchParams.get("registered");
  const justReset = searchParams.get("reset");
  const justVerified = searchParams.get("verified");
  const needsVerification = searchParams.get("verify");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [form, setForm] = useState({ email: "", password: "" });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setFormError("");

    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        // Deliberately the same message for a wrong password and an unknown
        // email. Anything more specific would let someone work out which
        // addresses are registered - see the dummy hash note in
        // src/lib/auth.ts, which does the same job for the timing.
        setFormError("Invalid email or password");
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch {
      // Reached when the request itself failed: the server is down, or the
      // rate limiter returned 429 and the NextAuth client threw before handing
      // us a result object.
      setFormError(
        "Could not sign in right now. Check your connection, or you may have tried too many times - wait a few minutes and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {justRegistered && (
        <div className="mt-6">
          <FormAlert tone="success">
            Account created. Check your email for the verification link.
          </FormAlert>
        </div>
      )}

      {justReset && (
        <div className="mt-6">
          <FormAlert tone="success">
            Password updated. Sign in with your new password.
          </FormAlert>
        </div>
      )}

      {justVerified && (
        <div className="mt-6">
          <FormAlert tone="success">
            Your email address has been verified. Sign in to continue.
          </FormAlert>
        </div>
      )}

      {needsVerification && (
        <div className="mt-6">
          <FormAlert tone="warning">
            Your email is not verified yet. Check your inbox for the
            verification link, or ask for a new one.
          </FormAlert>
        </div>
      )}

      {formError && (
        <div className="mt-6">
          <FormAlert tone="error">{formError}</FormAlert>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <TextField
          id="email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
        />

        <TextField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          labelAccessory={
            <Link
              href="/forgot-password"
              className="text-[13px] font-medium text-blue-600 hover:underline"
            >
              Forgot your password?
            </Link>
          }
        />

        <SubmitButton isSubmitting={isSubmitting} loadingText="Signing in...">
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm font-medium">
        No account yet?{" "}
        <Link
          href="/register"
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
