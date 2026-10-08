import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { registerSchemaWithMatch } from "@/lib/validators/auth";
import { createVerificationToken } from "@/lib/email/token";
import { sendVerificationEmail } from "@/lib/email/send";
import bcrypt from "bcryptjs";

// The brief specifies 12 salt rounds. Lower numbers are faster but weaker;
// bcryptjs is pure JavaScript so 12 costs roughly 300ms per hash, which is
// slow enough to hurt a user and slow enough to hurt an attacker.
const SALT_ROUNDS = 12;

// Never reveal whether an email is already registered.
//
// The wording is identical in every failure case, so this endpoint cannot be
// used to discover which email addresses have accounts. That is a deliberate
// security decision, and it is paired with the dummy-hash trick in
// src/lib/auth.ts, which hides the timing difference.
const GENERIC_ERROR = "Unable to create your account. Please try again.";

export async function POST(request: Request) {
  // Parse the request body as JSON. A client can send anything at all, so this
  // is wrapped in a try/catch: malformed JSON throws, and an unhandled throw
  // here would produce a 500 instead of a helpful 400.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  // Validate with Zod. Nothing touches the database until this passes.
  const parsed = registerSchemaWithMatch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields.",
        // Field-level messages so the form can show each one next to the right
        // input box rather than one vague line at the top.
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  // Hash before storing. The plain password is never written anywhere.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    // Only the three fields we want. Prisma would happily accept the rest of
    // parsed.data, and a passwordHash, so the field list is deliberate.
    const user = await prisma.user.create({
      data: { name, email, password: passwordHash },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    // PHASE 3: send the verification email.
    //
    // Note the order. The account is created FIRST, then the email is sent.
    // The reverse would be worse: an email that promises a working account for
    // one that was never created is a lie the user cannot resolve.
    //
    // Also note this is deliberately NOT awaited in a way that can fail the
    // request. sendVerificationEmail() returns { ok: false } rather than
    // throwing, so a Resend outage degrades to "no email" instead of "your
    // signup is broken". The user keeps their account and can hit resend.
    const token = await createVerificationToken(email);
    const sent = await sendVerificationEmail(email, token);

    if (!sent.ok) {
      // Logged for us, never returned to the client. Telling the browser
      // "email failed" would be fine here (the account already exists, so
      // there is nothing to leak), but the message is generic anyway, and
      // one generic path is easier to keep correct than two.
      console.error("Verification email failed for %s: %s", email, sent.error);
    }

    // 201 = created. Note the response contains no passwordHash, no raw
    // token, and no tokenHash - `select` on the user plus this object decide
    // what leaves this function.
    //
    // `verificationSent` is new in Phase 3: the signup page uses it to tell
    // the user to check their inbox rather than implying they are done.
    return NextResponse.json(
      { user, verificationSent: sent.ok },
      { status: 201 }
    );
  } catch (error) {
    // Two things can land here.
    //
    // 1. Prisma error P2002 = unique constraint failed = that email is taken.
    //    We do NOT pre-check with findUnique, because that would be a race:
    //    two requests arriving together could both pass the check and then
    //    both try to insert. Only the database can enforce uniqueness, and it
    //    does this one instantly and permanently.
    //
    // 2. Anything else is a genuine fault and should be logged so it can be
    //    fixed, rather than hidden behind the same vague message forever.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: GENERIC_ERROR },
          { status: 409 }
        );
      }
      console.error("Registration failed:", error);
    } else {
      console.error("Registration failed:", error);
    }

    // 500 = something broke on our side, not the user's fault.
    return NextResponse.json(
      { error: GENERIC_ERROR },
      { status: 500 }
    );
  }
}