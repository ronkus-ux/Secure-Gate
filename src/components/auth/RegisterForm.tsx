"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import TextField from "@/components/ui/TextField";
import SubmitButton from "@/components/ui/SubmitButton";
import FormAlert from "@/components/ui/FormAlert";

// ---------------------------------------------------------------------------
// RegisterForm - the "register" mode of the single auth screen.
//
// See LoginForm for the layout note. This file holds only the form; the shell
// and the choice of which form to show live in AuthScreen.
// ---------------------------------------------------------------------------
export default function RegisterForm() {
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

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    // Clear this field's error as soon as the user starts fixing it.
    setFieldErrors((previous) => ({ ...previous, [name]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setFormError("");
    setFieldErrors({});

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      router.push("/login?registered=1");
    } catch {
      setFormError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {formError && (
        <div className="mt-6">
          <FormAlert tone="error">{formError}</FormAlert>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <TextField
          id="name"
          name="name"
          label="Full name"
          autoComplete="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
        />

        <TextField
          id="email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          error={fieldErrors.email}
        />

        <TextField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          error={fieldErrors.password}
          showStrength
        />

        <TextField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          error={fieldErrors.confirmPassword}
        />

        <SubmitButton isSubmitting={isSubmitting} loadingText="Creating account...">
          Sign up
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm font-medium">
        Already have one?{" "}
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
