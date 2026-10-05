"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// "use client" marks this file as running in the browser rather than the
// server. That matters because this file needs to react to typing and
// clicking, which only happens on the user's side.
//
// It does NOT mean the code is unsafe. It means Next.js ships this file to the
// browser so it can respond to events. Anything secret must never be written
// here - no database passwords, no API keys.
export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // One message per field, keyed by field name. The server sends these back
  // when it rejects the form, and each one shows under the right input box.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // A single overall message, for problems that are not about one field -
  // "that email is already taken", or the server being down.
  const [formError, setFormError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = event.target;

    setForm((previous) => ({ ...previous, [name]: value }));

    // Clear this field's error as soon as the user starts fixing it. Leaving
    // a red error sitting under a box they have now corrected feels broken.
    setFieldErrors((previous) => ({ ...previous, [name]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Stop the browser doing its own form submit, which would reload the page
    // and lose everything typed.
    event.preventDefault();

    setIsSubmitting(true);
    setFormError("");
    setFieldErrors({});

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The form values go to our own API route on our own server. The
        // password is sent once, in this request, and never stored anywhere
        // by the browser.
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        // 400 means the input was wrong, so the server sent a message for each
        // bad field. Anything else (409 already taken, 500 server problem) is
        // one general message.
        if (response.status === 400 && data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
        } else {
          setFormError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Success. Send them to login with a flag so the page can confirm the
      // account was created.
      router.push("/login?registered=1");
    } catch {
      // fetch itself failed - no connection, or the server is unreachable.
      setFormError("Cannot reach the server. Check your connection and try again.");
    } finally {
      // Always re-enable the button, whether it worked or not, so the form
      // never gets stuck on "Signing up..." forever.
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Already have one?{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>

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
              <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>
              )}
            </div>

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
              {fieldErrors.email && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating account..." : "Sign up"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}