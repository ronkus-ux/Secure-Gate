import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { createPasswordResetToken } from "@/lib/email/token";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { clientIp, forgotPasswordLimiter } from "@/lib/rate-limit";

// The brief's one hard rule for this endpoint:
//
//   "if the email is not found, still return a success message - do not
//    confirm whether the email exists"
//
// So the response below is the same in every case where the input is well
// formed: 200, and a message that neither confirms nor denies anything. An
// attacker probing this endpoint with a list of emails learns nothing from it.
//
// Rate limiting on this endpoint is Phase 5 (Upstash Redis), per the brief.
export async function POST(request: Request) {
  // PHASE 5: rate limit by IP before doing anything else. This blocks an
  // attacker who tries to use this endpoint to hammer the email channel or
  // probe the enumeration rules - whatever the input, more than 5 requests in
  // 10 minutes from one IP gets a 429.
  const { success } = await forgotPasswordLimiter.limit(clientIp(request));

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

  // Look up the account. Found or not, the response is the same - the only
  // difference is whether we create a token and send a real email.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true },
  });

  if (user) {
    const token = await createPasswordResetToken(email);
    const sent = await sendPasswordResetEmail(email, token);

    if (!sent.ok) {
      // Logged for us, never revealed to the client. Whatever we just got is
      // still reported as a success so the enumeration rule holds even under
      // an email outage - a strange message here would tell the attacker the
      // address exists.
      console.error("Reset email failed for %s: %s", email, sent.error);
    }
  }

  // Note: for an unknown email we skip the token creation AND the email send
  // entirely. That keeps the database clean - no rows are created for
  // addresses that do not exist - and the response is identical regardless.
  return NextResponse.json({
    message:
      "If an account exists for that address, a reset link is on its way.",
  });
}