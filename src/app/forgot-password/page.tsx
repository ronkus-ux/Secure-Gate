"use client";

import { useState } from "react";
import Link from "next/link";

// "use client": this page reacts to typing and clicking, so it runs in the
// browser. It holds no secrets - it only sends the one email address to the
// API route and shows the reply.
export default function ForgotPasswordPage() {
  // Once submitted, the form collapses into a confirmation message. There is
  // no "was that email real?" state because the API deliberately never tells
  // us that - it answers the same way whether the address exists or not.
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError("");
    setFieldError("");

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.fieldErrors?.email) {
          setFieldError(data.fieldErrors.email);
        } else {
          setFormError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Success. The same confirmation is shown for a real or unknown address,
      // so this page cannot be used to discover which emails have accounts.
      setSubmitted(true);
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
            Forgot your password?
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your email and we will send you a link to reset it.
          </p>

          {submitted ? (
            <div
              role="status"
              className="mt-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              If an account exists for that address, a reset link is on its
              way. Check your inbox.
            </div>
          ) : (
            <>
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
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {fieldError && (
                    <p className="mt-1 text-sm text-red-600">{fieldError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Sending link..." : "Send reset link"}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-sm text-slate-500">
            Remembered it?{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}