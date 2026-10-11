import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { clientIp, loginLimiter } from "@/lib/rate-limit";

// The rate limiter runs here, in middleware, for the sign-in endpoints.
//
// Rate limiting in middleware means it applies to EVERY request reaching the
// auth route, before NextAuth ever runs - including requests that would never
// reach authorize() because they fail validation. It also keeps the auth
// handler itself free of limit logic, so NextAuth's own callback behaviour is
// untouched.
//
// The limit is per-IP, keyed by X-Forwarded-For (see src/lib/rate-limit.ts for
// why that header).

// This file runs BEFORE the page loads, on every request to /dashboard.
//
// What it does: checks whether the person arriving has a valid session cookie.
// If they do, nothing happens and the page loads normally. If they do not,
// they are sent to the login page instead.
//
// Why it exists: middleware is the only place that runs before your page code.
// Without it, the dashboard page itself would have to check the session, and
// any new page added under /dashboard could forget to do that.
export async function middleware(request: NextRequest) {
  // PHASE 5: rate-limit the credential sign-in POSTs.
  //
  // NextAuth's own form posts to /api/auth/signin; our custom login page posts
  // to /api/auth/callback/credentials through signIn("credentials"). Both are
  // "signing in", so both count against the same 5-in-10-minutes budget.
  //
  // Note the early return: an auth POST must go straight to NextAuth. Running
  // the dashboard session check below on it would bounce a perfectly valid
  // unauthenticated login attempt to /login - the request would never reach
  // the auth handler at all.
  if (
    request.method === "POST" &&
    (request.nextUrl.pathname === "/api/auth/signin" ||
      request.nextUrl.pathname === "/api/auth/callback/credentials")
  ) {
    const ip = clientIp(request);
    const { success } = await loginLimiter.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    return NextResponse.next();
  }

  // Reads the session cookie. It does NOT hit the database - it just verifies
  // the cookie's signature and expiry. That is fast enough to run on every
  // request.
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // No valid cookie. Send them to login.
  if (!token) {
    const loginUrl = new URL("/login", request.url);

    // Remember where they were trying to go, so login can send them back
    // there afterwards instead of dumping them on the home page.
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  // Valid cookie. Carry on to the page.
  return NextResponse.next();
}

// Which requests this file applies to. Without this, middleware would run on
// every single file in the project.
//
//   /dashboard        -> exact match
//   /dashboard/:path*  -> /dashboard AND anything under it
//                         (e.g. /dashboard/settings, /dashboard/profile/edit)
//
// The classic auth endpoints are included so the rate limiter can see sign-in
// POSTs, and excluded from the session check below by the dashboard-only
// session logic above - the auth routes are public by design (a signed-out
// person must be able to reach them).
//
// Everything else stays public, which is correct - the login and register
// pages must be reachable by a signed-out person.
export const config = {
  matcher: ["/dashboard/:path*", "/api/auth/signin", "/api/auth/callback/credentials"],
};