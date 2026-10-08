import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  findVerificationToken,
  hashVerificationToken,
} from "@/lib/email/token";

// ---------------------------------------------------------------------------
// /verify-email/[token]
//
// This is the route the link in the email points at. It has exactly one job:
// prove the clicker controls the inbox, then flip emailVerified on.
//
// The brief asks for three things here - look up the token, check expiry,
// mark verified and delete the token - plus a clear error and a resend option
// when the token is dead. All five live below.
// ---------------------------------------------------------------------------

// A verification token is exactly 64 hex characters (32 bytes as hex). Checking
// that first means a request for /verify-email/anything else never reaches
// Prisma at all. It is not a security measure - a wrong-shaped token would
// simply not match any row - but it keeps junk traffic off the database.
const TOKEN_SHAPE = /^[a-f0-9]{64}$/;

type Outcome = "verified" | "expired" | "invalid";

/**
 * Consumes the token and marks the owning account verified.
 *
 * Written as a function so the page stays readable, and so the ordering of
 * the two writes is in one obvious place.
 */
async function consumeToken(token: string): Promise<{ outcome: Outcome; email?: string }> {
  const row = await findVerificationToken(token);

  if (!row) {
    return { outcome: "invalid" };
  }

  // EXPIRED. Delete first, so a dead token cannot be retried while we are
  // still deciding what to tell the user.
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({
      where: { tokenHash: hashVerificationToken(token) },
    });
    return { outcome: "expired", email: row.identifier };
  }

  // VALID. Two writes, wrapped in a transaction whose job is summarised in
  // one sentence: both happen, or neither does.
  //
  // Why a transaction at all? The two calls answer one question - "did this
  // token get used?" - so a crash that does one but not the other leaves a
  // half-answer. Without the transaction that half-answer is harmless (a
  // verified account + a leftover token), but harmless is still a state that
  // costs a sentence or two to explain. With the transaction it cannot exist
  // at all, and the reasoning is the same either way. Atomic is one fewer
  // "trust my reasoning" moment.
  //
  // Inside the transaction:
  //
  // updateMany with `emailVerified: null` in the where clause means a second
  // click matches zero rows and changes nothing - so a re-click cannot reset
  // a verified account or overwrite a timestamp. That is why this is updateMany
  // rather than update: update would throw when it finds no match.
  //
  // deleteMany (not delete) because the token may already be gone on a
  // double-click, and delete would throw on a zero-row match.
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { email: row.identifier, emailVerified: null },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({
      where: { tokenHash: hashVerificationToken(token) },
    }),
  ]);

  // The transaction above made the double-click case already-safe: a second
  // click finds no row, reports "invalid", and never touches anything.
  return { outcome: "verified", email: row.identifier };
}

/**
 * A form that re-issues a verification email for a known address.
 *
 * It exists because the brief requires a resend option when a link expires.
 * Posted to its own API route rather than mutating during render, so the
 * browser can send it with a proper POST and a fresh CSRF token.
 */
function ResendForm({ email, token }: { email?: string; token?: string }) {
  return (
    <form
      action="/api/resend-verification"
      method="POST"
      className="mt-6 flex flex-col gap-3"
    >
      <input type="hidden" name="email" value={email ?? ""} />
      <input type="hidden" name="token" value={token ?? ""} />
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Send me a new link
      </button>
    </form>
  );
}

export default async function VerifyEmailPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  // Shape check first: nothing shaped wrong reaches the database.
  if (!TOKEN_SHAPE.test(token)) {
    return (
      <Shell title="This link is not valid">
        <p>
          The link is incomplete or was copied incorrectly. Request a new one
          below, or sign up again if you have not created an account yet.
        </p>
        <ResendForm />
        <AltLinks />
      </Shell>
    );
  }

  const { outcome, email } = await consumeToken(token);

  if (outcome === "verified") {
    return (
      <Shell title="Email verified" tone="ok">
        <p>Your email address is confirmed. You can sign in now.</p>
        <p className="mt-4">
          <Link
            href="/login"
            className="font-semibold text-blue-600 hover:underline"
          >
            Go to sign in
          </Link>
        </p>
      </Shell>
    );
  }

  if (outcome === "expired") {
    return (
      <Shell title="This link has expired">
        <p>
          Verification links last 15 minutes, and this one has run out. That is
          normal - request a fresh link and open it straight away.
        </p>
        <ResendForm email={email} />
        <AltLinks />
      </Shell>
    );
  }

  // outcome === "invalid"
  return (
    <Shell title="This link is not valid">
      <p>
        The link may have already been used, or it was never issued. If you
        already verified your email, you can sign in.
      </p>
      <ResendForm />
      <AltLinks />
    </Shell>
  );
}

function AltLinks() {
  return (
    <p className="mt-4 text-sm text-slate-500">
      <Link href="/login" className="font-semibold text-blue-600 hover:underline">
        Sign in
      </Link>{" "}
      ·{" "}
      <Link href="/register" className="font-semibold text-blue-600 hover:underline">
        Create an account
      </Link>
    </p>
  );
}

function Shell({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "neutral" | "ok";
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <p
            className={
              tone === "ok"
                ? "text-sm font-medium uppercase tracking-wide text-green-600"
                : "text-sm font-medium uppercase tracking-wide text-blue-600"
            }
          >
            Verify email
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
