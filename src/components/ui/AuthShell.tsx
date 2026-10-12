import Link from "next/link";

// ---------------------------------------------------------------------------
// AuthShell - the one wrapper every auth screen sits in.
//
// Before this existed, login, register, forgot-password and reset each repeated
// the same "centre a max-width column on a slate background" markup, and the
// two status pages repeated it again. Centralised here so the pages cannot
// drift apart, and so restyling the whole app is a one-file change.
//
// Deliberately minimal: no card panel. The whole app is a flat surface, so the
// content sits directly on the page background (see globals.css).
// ---------------------------------------------------------------------------
export default function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-slate-50 p-8">
        <Link
          href="/"
          className="block text-center text-sm font-semibold uppercase tracking-widest text-blue-600"
        >
          SecureGate
        </Link>

        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>

        <div className="mt-6 text-sm leading-relaxed text-slate-600">
          {children}
        </div>
      </div>
    </main>
  );
}
