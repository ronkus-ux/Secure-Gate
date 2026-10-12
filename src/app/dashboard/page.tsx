import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/ui/LogoutButton";

// No "use client" here on purpose. This file runs on the server only, so the
// session is read on our machine and never exposed to the browser as
// JavaScript. There is no form here and nothing to react to, so the browser
// has no reason to need this code.
export default async function DashboardPage() {
  // THE SECOND CHECK.
  //
  // middleware.ts already bounces signed-out users away from /dashboard. This
  // repeats the check, on purpose.
  //
  // Why bother? middleware matches on URL patterns, which are easy to get
  // wrong. Rename a route, add a page under /dashboard, typo the matcher, and
  // something could end up unprotected without anyone noticing. Checking here
  // means a page only ever renders for a real session, whatever middleware
  // decided.
  //
  // Term (bracket): two independent checks like this is called defence in
  // depth. If one of them is wrong, the other still holds.
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    // redirect() throws, so nothing after this line runs and no else is
    // needed. It is the one control-flow statement we never come back from.
    //
    // We deliberately do not echo a ?callbackUrl value in here. Taking that
    // from the query string and putting it straight into a redirect is an open
    // redirect - it would let someone craft a link that bounces a signed-in
    // user to a site of their choosing, carrying our URL in the address bar.
    // Term (bracket): an open redirect is a genuine phishing tool.
    redirect("/login");
  }

  // PHASE 3: only verified users may be here.
  //
  // Why this check lives HERE and not in middleware.ts:
  //
  // Middleware reads the JWT cookie, and the cookie does not know whether the
  // account is verified - that fact lives in the database. Put the check in
  // middleware and it would either block people who verified AFTER signing in
  // (stale cookie), or let unverified users through (no way to tell).
  //
  // This page, however, uses getServerSession(), whose session callback re-reads
  // emailVerified from the database on EVERY request (see auth.ts). So the value
  // here is always current, minutes after the user clicks their link.
  //
  // If the user is logged in but not verified, they are directed to a page that
  // explains what is missing, instead of being silently dumped back to /login
  // with no reason.
  if (!session.user.emailVerified) {
    redirect("/login?verify=1");
  }

  const { name, email, emailVerified } = session.user;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-slate-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Dashboard
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Welcome{name ? `, ${name}` : ""}
        </h1>

        <dl className="mt-8 space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-200 pb-3">
            <dt className="text-slate-500">Signed in as</dt>
            <dd className="font-semibold text-slate-900">{email}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-200 pb-3">
            <dt className="text-slate-500">User ID</dt>
            <dd className="font-mono text-xs text-slate-700">
              {session.user.id}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Email verified</dt>
            <dd className="font-semibold text-slate-900">
              {emailVerified ? "Yes" : "Not yet"}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex justify-end border-t border-slate-200 pt-4">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}