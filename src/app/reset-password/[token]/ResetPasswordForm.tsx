"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AuthShell from "@/components/ui/AuthShell";
import TextField from "@/components/ui/TextField";
import SubmitButton from "@/components/ui/SubmitButton";
import FormAlert from "@/components/ui/FormAlert";

// The form that actually accepts the new password. It is a client component
// because it reacts to typing and submits over fetch - mirroring the register
// form. The token arrives as a prop straight from the validated URL above, so
// this component never has to look at the address bar itself.
export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();

  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setFieldErrors((previous) => ({ ...previous, [name]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setFormError("");
    setFieldErrors({});

    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
        } else {
          setFormError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Password changed. Send them to login to sign in with the new password.
      router.push("/login?reset=1");
    } catch {
      setFormError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Choose a new password">
      {formError && (
        <div className="mb-6">
          <FormAlert tone="error">{formError}</FormAlert>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          id="password"
          name="password"
          label="New password"
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
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          error={fieldErrors.confirmPassword}
        />

        <SubmitButton isSubmitting={isSubmitting} loadingText="Saving...">
          Set new password
        </SubmitButton>
      </form>

      <p className="mt-6">
        <Link href="/login" className="font-semibold text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
