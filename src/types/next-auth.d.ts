import type { DefaultSession } from "next-auth";

// ---------------------------------------------------------------------------
// This file adds fields we want on `session.user` and `token`.
//
// NextAuth is a library someone else wrote. It has no idea we want a user ID
// or a verification date on the session, so its built-in types only describe
// name, email and image.
//
// TypeScript's "declaration merging" lets us extend those types without
// editing the library. This file is picked up automatically by tsconfig.json
// via the "include" glob - it is never imported anywhere, and that is normal.
// ---------------------------------------------------------------------------

// Re-declaring `Session` under the same name MERGES it with NextAuth's
// version rather than replacing it. The result has all three built-in fields
// PLUS the two we added.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      emailVerified: Date | null;
    } & DefaultSession["user"];
  }

  // `emailVerified` is optional here (but required on Session above).
  //
  // The difference is deliberate: `User` is what our authorize() function
  // RETURNS, and that object genuinely has no emailVerified - we deliberately
  // do not read it there. The session callback fetches it separately.
  //
  // Marking it required would force every return in authorize() to include a
  // value it does not have.
  interface User {
    id: string;
    emailVerified?: Date | null;
  }
}

// This one merges with NextAuth's JWT shape.
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}