import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// This file exists only to hand our authOptions to NextAuth.
//
// You might wonder why there is any code here at all. The answer is that the
// App Router needs a file at exactly this path, and it must export the
// handlers. This is the doorway NextAuth answers on. Everything interesting
// lives in src/lib/auth.ts - this file is just the address.
//
// The GET and POST names are required. NextAuth uses GET to serve its own
// pages (/api/auth/session, /api/auth/csrf) and POST for the form submissions
// that actually log you in and out.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };