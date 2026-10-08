import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  findPasswordResetToken,
  hashVerificationToken,
} from "@/lib/email/token";

import ResetPasswordForm from "./ResetPasswordForm";

const TOKEN_SHAPE = /^[a-f0-9]{64}$/;

type Outcome = "valid" | "expired" | "invalid";

async function checkToken(token: string): Promise<{
  outcome: Outcome;
  email?: string;
}> {
  const row = await findPasswordResetToken(token);

  if (!row) {
    return { outcome: "invalid" };
  }

  // EXPIRED. Delete first, exactly as consumeToken does for verification
  // links, so a dead token cannot be retried while we decide what to show.
  if (row.expires.getTime() < Date.now()) {
    await prisma.passwordResetToken.deleteMany({
      where: { tokenHash: hashVerificationToken(token) },
    });
    return { outcome: "expired" };
  }

  return { outcome: "valid", email: row.email };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  // Shape check first: a wrong-shaped token never reaches the database.
  if (!TOKEN_SHAPE.test(token)) {
    return (
      <Shell title="This link is not valid">
        <p>The reset link is incomplete or was copied incorrectly.</p>
        <AltLinks />
      </Shell>
    );
  }

  const { outcome } = await checkToken(token);

  if (outcome === "expired") {
    return (
      <Shell title="This link has expired">
        <p>
          Reset links last 1 hour, and this one has run out. That is normal -
          request a fresh one to pick a new password.
        </p>
        <p className="mt-4">
          <Link
            href="/forgot-password"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Request a new link
          </Link>
        </p>
        <AltLinks />
      </Shell>
    );
  }

  if (outcome === "invalid") {
    return (
      <Shell title="This link is not valid">
        <p>
          The reset link may have already been used. If you reset your
          password already, you can sign in with the new one.
        </p>
        <p className="mt-4">
          <Link
            href="/forgot-password"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Request a new link
          </Link>
        </p>
        <AltLinks />
      </Shell>
    );
  }

  // VALID. Render the new-password form.
  return <ResetPasswordForm token={token} />;
}

function AltLinks() {
  return (
    <p className="mt-4 text-sm text-slate-500">
      <Link href="/login" className="font-semibold text-blue-600 hover:underline">
        Sign in
      </Link>{" "}
      ·{" "}
      <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">
        Forgot password
      </Link>
    </p>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
            Reset password
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          <div className="mt-4 text-sm leading-relaxed text-slate-600">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}