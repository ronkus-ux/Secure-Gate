import type { ReactNode } from "react";

// The one submit button. Every form used to repeat the same long className
// plus the "isSubmitting ? '...' : '...'" label swap. One definition means the
// loading behaviour is identical everywhere.
//
// `disabled` while submitting prevents double-submits; `aria-busy` tells a
// screen reader the action is in progress.
export default function SubmitButton({
  isSubmitting,
  children,
  loadingText = "Please wait...",
}: {
  isSubmitting: boolean;
  children: ReactNode;
  loadingText?: string;
}) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
      className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSubmitting ? loadingText : children}
    </button>
  );
}
