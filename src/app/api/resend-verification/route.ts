import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/email/token";
import { sendVerificationEmail } from "@/lib/email/send";

// ---------------------------------------------------------------------------
// POST /api/resend-verification
//
// Called from the "Send me a new link" button on /verify-email/*, where the
// original link has expired or was never valid.
// ---------------------------------------------------------------------------

// Deliberately identical for every outcome. This endpoint takes an email and
// always answers the same way, so it cannot be used to discover which
// addresses have accounts - the same rule the signup route follows.
const GENERIC = "If an account exists for that address, a new link is on its way.";

export async function POST(request: Request) {
  let body: URLSearchParams | Record<string, string>;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    body = contentType.includes("application/json")
      ? await request.json()
      : await request.formData();
  } catch {
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }

  const read = (key: string): string => {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  };

  // The page posts the address it already knows, but never trust that: anyone
  // can post anything here. Re-read it as the only source of truth.
  const email = read("email");
  if (!email) {
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }

  // Find the account, then decide.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // No account, or already verified: answer identically to the success case.
  // Nothing here says which happened.
  if (!user || user.emailVerified) {
    return NextResponse.json({ message: GENERIC }, { status: 200 });
  }

  // A real, unverified account - issue a fresh token. createVerificationToken
  // deletes any previous row first, so an old link stops working the moment a
  // new one is sent. Only one valid link exists at a time.
  const token = await createVerificationToken(email);
  const sent = await sendVerificationEmail(email, token);

  if (!sent.ok) {
    // Logged, not returned. The client sees the same generic message either
    // way, so a delivery failure does not become an oracle for account status.
    console.error("Resend verification failed for %s: %s", email, sent.error);
  }

  return NextResponse.json({ message: GENERIC }, { status: 200 });
}
