import Link from "next/link";

// Phase 6: this was still the untouched create-next-app template. It is now a
// minimal landing that matches the auth screens: same uppercase eyebrow, same
// cross-link rhythm, same flat surface. Deliberately no card, glow, chips or
// icons - one primary action and one secondary link is the whole job.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 sm:px-10">
      <div className="w-full max-w-4xl text-center">
        <p className="text-[clamp(1.25rem,2.5vw,1.5rem)] font-bold uppercase tracking-wider text-blue-600">
          SecureGate
        </p>

        <h1 className="mt-2 text-[clamp(1.5rem,4.5vw,3.25rem)] font-bold leading-tight tracking-tight text-slate-900">
          Secure sign-in, email verification, and password reset.
        </h1>

        <p className="mx-auto mt-4 max-w-md text-[15px] font-medium leading-relaxed text-slate-600 sm:max-w-xl">
          A focused authentication system with session security and rate
          limiting built in.
        </p>

        <div className="mt-8">
          <Link
            href="/register"
            className="inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create An Account
          </Link>
        </div>

        <p className="mt-4 text-sm font-medium text-slate-700">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
