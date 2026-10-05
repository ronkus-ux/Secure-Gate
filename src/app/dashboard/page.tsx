import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { authOptions } from "@/lib/auth";

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

  const { name, email, emailVerified } = session.user;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
            Dashboard
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Welcome{ name ? `, ${name}` : "" }
          </h1>
          <p className="mt-2 text-sm text-slate-600">{email}</p>

          {emailVerified ? (
            <div className="mt-8 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold">Email verified</p>
            </div>
          ) : (
            // Phase 2 only requires a valid session, so an unverified user can
            // still reach this page. Phase 3 makes this branch strict: it sends
            // unverified users out to verify their email address.
            <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Email not verified yet</p>
              <p className="mt-1">
                Phase 2 only requires you to be signed in, so you can see this
                page. Phase 3 adds the emailed verification link and makes this
                check strict.
              </p>
            </div>
          )}

          <dl className="mt-8 space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Signed in as</dt>
              <dd className="font-medium text-slate-900">{email}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">User ID</dt>
              <dd className="font-mono text-xs text-slate-700">
                {session.user.id}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Email verified</dt>
              <dd className="font-medium text-slate-900">
                {emailVerified ? "Yes" : "Not yet"}
              </dd>
            </div>
          </dl>

          {/* Placeholder for later phases. Phase 4 builds /settings, and the
              admin roles land further along. Adding the links now would give
              you 404s. */}
          <div className="mt-8 flex gap-4 text-sm">
            <Link
              href="/"
              className="font-semibold text-blue-600 hover:underline"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}