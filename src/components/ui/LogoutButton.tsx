"use client";

import { signOut } from "next-auth/react";

// Phase 6: the brief requires a proper logout (clean session destruction,
// redirect to login). next-auth's signOut() destroys the session cookie on the
// server and then sends the browser to /login.
//
// Styled as a small text link rather than a button, because signing out is a
// secondary/exit action: it should not compete with the page content. It stays
// a <button> (not an <a>) because there is no URL to navigate to - the click
// handler is what does the work.
export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-xs font-medium text-slate-500 hover:text-red-600 hover:underline focus:outline-none focus:underline"
    >
      Sign out
    </button>
  );
}
