import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators/auth";

// NextAuth needs a real bcrypt hash to compare against when an email does not
// exist in the database. It is a genuine hash of a random string - no account
// uses this password, it just gives us something for bcrypt.compare() to chew
// on.
//
// Why bother? If the email is unknown we still run a bcrypt comparison, which
// takes the same ~100ms as a real one. Without this, "email not found" would
// return almost instantly while "wrong password" took 100ms. An attacker could
// time the difference and discover which addresses are registered.
const DUMMY_HASH =
  "$2a$12$HLzbrUFuhKBYXFIuJaQEdOQEHpuzkJBLNmTwlktuevRng3nmOxKKq";

export const authOptions: NextAuthOptions = {
  // Session strategy: JWT.
  //
  // With JWT the session lives in a cookie, so every request is authenticated
  // without a database round trip. We do not use the database session strategy
  // because it requires storing session rows and adding a Session table.
  //
  // The trade-off: a JWT cannot be deleted from the server side. Once issued,
  // it stays valid until it expires. That is why the lifetime below is short.
  // The alternative - a database session - can be revoked instantly by deleting
  // the row, which is why Phase 7 (admin) would want it.
  session: {
    strategy: "jwt",
    // 30 minutes. Short enough that a stolen cookie is useful for a while but
    // not forever.
    maxAge: 30 * 60,
  },

  // The cookie itself should also expire with the session.
  jwt: {
    maxAge: 30 * 60,
  },

  pages: {
    // NextAuth renders its own sign-in page by default at /api/auth/signin.
    // We built our own, so point NextAuth at ours.
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      // authorize() runs when someone submits the login form.
      // Return a user object to sign in, or return null to refuse.
      async authorize(credentials) {
        // Validate before touching the database.
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Case 1: no such account. Compare against the dummy hash anyway so
        // this branch takes the same time as case 2.
        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        // Case 2: account exists. Check the password. Note we do NOT say which
        // case failed - both return null, so login cannot be used to discover
        // which email addresses are registered.
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
          return null;
        }

        // Only these three fields are returned. `user` holds the password hash;
        // returning it wholesale would leak it into the session.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],

  // The callbacks decide what ends up in the session, and therefore what the
  // browser receives. Anything not added here is invisible to the client.
  callbacks: {
    async jwt({ token, user }) {
      // Runs on sign-in (user is present) and on every later request
      // (user is undefined). Only copy across on sign-in; afterwards we trust
      // the existing token.
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      // Copy our extra values from the token onto the session object, which is
      // what the app actually reads.
      if (session.user) {
        session.user.id = token.id as string;
        // Read from the database rather than trusting the token, so a later
        // email verification is reflected immediately and not after the token
        // expires.
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { emailVerified: true },
        });
        session.user.emailVerified = fresh?.emailVerified ?? null;
      }
      return session;
    },
  },
};