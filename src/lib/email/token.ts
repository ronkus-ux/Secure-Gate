import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Phase 3 - verification tokens.
//
// The brief specifies crypto.randomBytes(32).toString("hex"), which gives a
// 64-character hex string. That is 32 bytes = 256 bits of entropy, so the
// chance of two tokens colliding is effectively zero.
//
// Why 32 bytes? The token is the only thing standing between "someone owns
// this inbox" and "someone gets an account". Guessing a 256-bit value is not a
// practical attack, so a short token length is the one place we must not
// economise.
// ---------------------------------------------------------------------------

// The brief specifies 15 minutes. A verification link is something the user
// clicks within seconds of reading the email, so a short window costs almost
// nobody anything while shrinking the attacker's window to something useless.
export const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Generates the raw token that goes in the email link.
 *
 * This value is NEVER stored. It exists in two places only: inside the
 * verification email, and in the URL the user clicks. Both are outside our
 * control, which is exactly why it must not be trusted as a stored value.
 *
 * crypto.randomBytes comes from Node's CSPRNG, not Math.random(). Math.random()
 * is seeded from a predictable source and is not cryptographically secure; for
 * anything an attacker could brute force that is disqualifying.
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hashes a raw token so it can be stored safely.
 *
 * This is SHA-256, not bcrypt, and that difference is deliberate:
 *
 *   bcrypt  - deliberately slow, which is what you want when the attacker has
 *             all the time in the world to guess a password.
 *   sha256  - fast, which is what you want here, because the input is already
 *             256 bits of unguessable randomness. There is nothing for an
 *             attacker to brute force, so slowing the check down would only
 *             waste our own time.
 *
 * The rule: slow hashing protects GUESSABLE secrets. Fast hashing is correct
 * for UNGUESSABLE secrets. Using bcrypt here would be cargo-culting.
 */
export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a fresh verification token for a user, replacing any they already had.
 *
 * Two things worth noting:
 *
 * 1. The deleteMany first. Without it a user who requests five emails ends up
 *    with five valid tokens, and any of the five works. Removing the old one
 *    means only the newest email can verify the account.
 *
 * 2. deleteMany and create are not wrapped in a transaction here. That is a
 *    small deliberate simplification: the worst case is a user with no valid
 *    token who clicks "resend", which is recoverable. Wrapping them would be
 *    more correct and is noted in REFLECTION.md as an improvement.
 */
export async function createVerificationToken(email: string): Promise<string> {
  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  // Clear any previous token for this email first, so only the newest link
  // works. deleteMany (not delete) because we may be deleting zero rows.
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  await prisma.verificationToken.create({
    data: { identifier: email, tokenHash, expires },
  });

  return token;
}

/**
 * Looks up a raw token and returns its database row, or null if there is none.
 *
 * The lookup is by HASH, never by raw token: we hashed the token before
 * storing it, so the database has no column containing the value the user
 * clicked. This is what makes a leaked database dump harmless.
 *
 * Note this does NOT check expiry. It returns expired rows too, because the
 * route has to tell the user two different things:
 *
 *   expired    -> "this link ran out, here is a new one"
 *   not found  -> "this link is not valid, sign up again"
 *
 * Collapsing both to null would force one vague message for two situations
 * that need different answers, and the brief asks for a clear error plus a
 * resend option on expiry.
 */
export async function findVerificationToken(
  token: string
): Promise<{ identifier: string; expires: Date } | null> {
  const tokenHash = hashVerificationToken(token);

  const row = await prisma.verificationToken.findUnique({
    where: { tokenHash },
    select: { identifier: true, expires: true },
  });

  return row;
}