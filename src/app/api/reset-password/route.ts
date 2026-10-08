import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { findPasswordResetToken, hashVerificationToken } from "@/lib/email/token";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

// This endpoint is the second half of the forgot-password flow. The link in
// the email lands on /reset-password/[token]; THIS is where the new password
// is actually committed, and it is only reached after the page has already
// convinced us the token is well-formed.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  // Find the token. No match = never issued, or already used.
  const row = await findPasswordResetToken(token);

  if (!row) {
    return NextResponse.json(
      { error: "This link is not valid. Request a new reset link." },
      { status: 400 }
    );
  }

  // EXPIRED. Delete it and report the fact, mirroring verify-email handling.
  if (row.expires.getTime() < Date.now()) {
    await prisma.passwordResetToken.deleteMany({
      where: { tokenHash: hashVerificationToken(token) },
    });
    return NextResponse.json(
      { error: "This link has expired. Request a new reset link." },
      { status: 400 }
    );
  }

  // VALID. Hash the new password, then swap it in and delete the token.
  // The two writes are atomic: the user either has a new password AND no
  // token, or neither. A crash in between would otherwise leave a state where
  // a used token can be replayed.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { email: row.email },
      data: { password: passwordHash },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { tokenHash: hashVerificationToken(token) },
    }),
  ]);

  return NextResponse.json({ ok: true });
}