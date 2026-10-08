import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared validation schemas.
//
// These live in their own file because two different routes need them:
//   - /api/register  (creating an account)
//   - the login flow (signing in)
// Writing the rules once means the two can never drift apart and disagree.
// ---------------------------------------------------------------------------

// bcrypt silently ignores everything past the first 72 bytes of a password.
// We cap at 72 BYTES rather than 72 characters, because one character can be
// several bytes. An emoji is 4 bytes; a Chinese character is 3.
//
// TextEncoder is used instead of Buffer.byteLength because TextEncoder works
// in both the browser and Node, so these schemas stay safe to import from a
// client component too.
const MAX_BCRYPT_BYTES = 72;

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

// Shared email rule, so signup and login can never disagree about what counts
// as an email address.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address");

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),

  email: emailField,

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine((value) => byteLength(value) <= MAX_BCRYPT_BYTES, {
      message: `Password must be ${MAX_BCRYPT_BYTES} bytes or fewer`,
    }),

  // Not validated on its own. It only has to match `password`, which is
  // checked on the object below.
  confirmPassword: z.string(),
});

// Runs after every field above has passed. If it returns false, the whole
// object is rejected.
//
// `path` tells Zod which field the error belongs to, so the form can show the
// message next to the right input box.
export type RegisterInput = z.infer<typeof registerSchema>;

export const registerSchemaWithMatch = registerSchema.refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  },
);

export const loginSchema = z.object({
  email: emailField,
  // No length limit here. A login attempt should never fail a format check
  // and reveal which rule was broken; an incorrect password just fails to
  // match the stored hash, which we report generically in the auth code.
  password: z.string().min(1, "Password is required"),
});

// Forgot-password: only the email matters, so only the email is validated.
export const forgotPasswordSchema = z.object({
  email: emailField,
});

// Reset-password: the token comes from the URL, the two password fields from
// the form. The password rule is deliberately identical to registerSchema so
// nobody can set a weaker password through the reset path than through signup.
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Missing reset token"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .refine((value) => byteLength(value) <= MAX_BCRYPT_BYTES, {
        message: `Password must be ${MAX_BCRYPT_BYTES} bytes or fewer`,
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });