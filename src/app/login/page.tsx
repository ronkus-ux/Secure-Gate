"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

// The part that reads the address bar has to sit inside <Suspense>, because
// Next.js cannot know at build time what ?registered=1 will be. The wrapper
// below is what satisfies that.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Set by the register page after a successful signup, so this page can
  // confirm the account exists rather than leaving the user wondering.
  const justRegistered = searchParams.get("registered");

  // Set by the dashboard when it turns away an unverified user, so this page
  // can explain what is missing instead of showing a blank form.
  const needsVerification = searchParams.get("verify");

  // Where the guard in middleware.ts wanted the user to go before it bounced
  // them here. If there was no guard redirect, this is null and we send them to
  // the dashboard as normal.
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
      // signIn() calls NextAuth for us: it POSTs to /api/auth/callback/
      // credentials, and the server runs our authorize() in src/lib/auth.ts.
      //
      // Note we never call our own API route here. Login has to go through
      // NextAuth so that NextAuth is the thing issuing the session cookie.
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false, // stay on this page so we can show an error
      });

      if (result?.error) {
        // Deliberately the same message for a wrong password and an unknown
        // email. Anything more specific would let someone work out which
        // addresses are registered - see the dummy hash note in
        // src/lib/auth.ts, which does the same job for the timing.
        setFormError("Invalid email or password");
        return;
      }

      // Session cookie now exists. Go where the user was originally heading.
      // router.refresh() forces the server components to re-read the new
      // session, so /dashboard renders as a signed-in user rather than the
      // cached signed-out version.
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setFormError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            No account yet?{" "}
            <Link href="/register" className="font-medium text-blue-600 hover:underline">
              Create one
            </Link>
          </p>

          {justRegistered && (
            <div className="mt-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Account created. Check your email for the verification link.
            </div>
          )}

          {needsVerification && (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your email is not verified yet. Check your inbox for the
              verification link, or ask for a new one.
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LoginForm />
    </Suspense>
  );
}