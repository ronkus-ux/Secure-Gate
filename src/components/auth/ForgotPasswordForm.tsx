"use client";

import { useState } from "react";
import Link from "next/link";

import TextField from "@/components/ui/TextField";
import SubmitButton from "@/components/ui/SubmitButton";
import FormAlert from "@/components/ui/FormAlert";

// ---------------------------------------------------------------------------
// ForgotPasswordForm - the "forgot" mode of the single auth screen.
//
// Holds no secrets: it only sends the one email address to the API route and
// shows the reply. The API answers the same way whether the address exists or
// not, so there is deliberately no "was that email real?" state here.
// ---------------------------------------------------------------------------
export default function ForgotPasswordForm() {
  // Once submitted, the form collapses into a confirmation message.
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

      setSubmitted(true);
    } catch {
      setFormError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <p>Enter your email and we will send you a link to reset it.</p>

      {submitted ? (
        <div className="mt-6">
          <FormAlert tone="success">
            If an account exists for that address, a reset link is on its way.
            Check your inbox.
          </FormAlert>
        </div>
      ) : (
        <>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldError}
            />

            <SubmitButton isSubmitting={isSubmitting} loadingText="Sending link...">
              Send reset link
            </SubmitButton>
          </form>
        </>
      )}

      <p className="mt-6 text-sm font-medium">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
