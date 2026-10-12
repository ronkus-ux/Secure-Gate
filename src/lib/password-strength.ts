export type Strength = "weak" | "fair" | "strong";

// Password strength from two signals only, as the brief asks: length and
// character variety. No external library - a handful of regex tests cover it.
//
//   1 point  length >= 8
//   1 point  length >= 12
//   1 point  has both lower and upper case
//   1 point  has a digit
//   1 point  has a symbol
//
// 0-2 weak, 3 fair, 4-5 strong. An empty string scores 0; callers should only
// render a meter once the user has typed something.
export function passwordStrength(password: string): Strength {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return "weak";
  if (score <= 3) return "fair";
  return "strong";
}
