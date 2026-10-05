import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

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
// Nothing else is affected. The login and register pages stay public, which is
// correct - a signed-out person must be able to reach them.
export const config = {
  matcher: ["/dashboard/:path*"],
};