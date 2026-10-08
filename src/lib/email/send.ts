import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Phase 3 - the email sender.
//
// Everything that leaves this file is text we control. Nothing here formats
// user input into HTML, and that is the most important property of a mailer:
// a template that interpolates raw HTML from the database is stored XSS by
// another name.
// ---------------------------------------------------------------------------

// Lazy singleton. Constructing Resend reads no secrets beyond the key, so this
// is cheap, but constructing it at import time would make `import` throw during
// `next build` if the env var were missing - and a build that fails because an
// optional email key is absent is a bad trade. It is created on first use.
let client: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set. Add it to .env.local.");
  }
  client ??= new Resend(apiKey);
  return client;
}

/**
 * Builds an absolute URL for a "click this in your email" link.
 *
 * Absolute, not relative, because these links are opened from an email client,
 * not from our site - there is no existing origin to resolve against.
 *
 * NEXTAUTH_URL is the right source for it: it already points at wherever the
 * app is running (localhost:3000 here, vercel.app in production), and using one
 * env var rather than two means the link can never point at the wrong host.
 */
function absoluteUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}${path}`;
}

function verificationUrl(token: string): string {
  return absoluteUrl(`/verify-email/${token}`);
}

function passwordResetUrl(token: string): string {
  return absoluteUrl(`/reset-password/${token}`);
}

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/**
 * Sends a verification email.
 *
 * Note the return shape: never throws. The caller is a signup flow where a
 * failed email should not delete the account the user just made, so the failure
 * is reported as a value the caller decides what to do with. Throwing here
 * would turn "email provider down" into "your account is gone".
 */
export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<SendResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    return { ok: false, error: "RESEND_FROM_EMAIL is not set." };
  }

  const url = verificationUrl(token);

  try {
    const { data, error } = await getResend().emails.send({
      from: `SecureGate <${from}>`,
      to,
      subject: "Verify your email address",
      // Plain text first. An HTML-only email looks better but reads worse in
      // text clients and in accessibility tools. The HTML is a small,
      // hand-written string with no interpolation at all - the only variable,
      // url, is our own hex token in our own URL, so there is no untrusted
      // input anywhere in this template.
      text: [
        "Welcome to SecureGate.",
        "",
        "Confirm your email address to activate your account:",
        url,
        "",
        "This link expires in 15 minutes.",
        "",
        "If you did not create this account you can ignore this email.",
      ].join("\n"),
      html: [
        "<!doctype html>",
        '<html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#0f172a">',
        "<h1 style=\"font-size:20px\">Confirm your email address</h1>",
        "<p>Click the button below to activate your account.</p>",
        `<p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Verify my email</a></p>`,
        `<p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br>${url}</p>`,
        '<p style="color:#64748b;font-size:13px">This link expires in 15 minutes. If you did not create this account, ignore this email.</p>',
        "</body></html>",
      ].join(""),
    });

    if (error) {
      // Logged, not returned verbatim: Resend errors can contain the API key
      // prefix or internal detail. The caller gets a safe string.
      console.error("Resend send failed:", error);
      return { ok: false, error: "Email could not be sent." };
    }

    return { ok: true, id: data?.id };
  } catch (err) {
    // Network failure, invalid key, quota - all land here.
    console.error("Resend threw:", err);
    return { ok: false, error: "Email could not be sent." };
  }
}

/**
 * Sends a password reset email.
 *
 * Same contract as sendVerificationEmail - never throws, reports failure as a
 * value - because the forgot-password flow has the same property: a failed
 * email must not make the user's situation worse. The endpoint still answers
 * "we've sent a link" either way (it must, to avoid confirming whether the
 * address exists); what varies internally is whether a token was created, so a
 * real email is sent only where the lookup found the account.
 */
export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<SendResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    return { ok: false, error: "RESEND_FROM_EMAIL is not set." };
  }

  const url = passwordResetUrl(token);

  try {
    const { data, error } = await getResend().emails.send({
      from: `SecureGate <${from}>`,
      to,
      subject: "Reset your password",
      text: [
        "You asked to reset your SecureGate password.",
        "",
        "Click the link below to choose a new one:",
        url,
        "",
        "This link expires in 1 hour.",
        "",
        "If you did not request this, you can ignore this email - your password will stay the same.",
      ].join("\n"),
      html: [
        "<!doctype html>",
        '<html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#0f172a">',
        "<h1 style=\"font-size:20px\">Reset your password</h1>",
        "<p>Click the button below to choose a new password.</p>",
        `<p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset password</a></p>`,
        `<p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br>${url}</p>`,
        '<p style="color:#64748b;font-size:13px">This link expires in 1 hour. If you did not request this, ignore this email.</p>',
        "</body></html>",
      ].join(""),
    });

    if (error) {
      console.error("Resend send failed:", error);
      return { ok: false, error: "Email could not be sent." };
    }

    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("Resend threw:", err);
    return { ok: false, error: "Email could not be sent." };
  }
}
