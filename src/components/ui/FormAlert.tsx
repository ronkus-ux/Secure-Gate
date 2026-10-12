import type { ReactNode } from "react";

type Tone = "error" | "success" | "warning";

const TONES: Record<Tone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

// The red / green / amber message box used across every form. `role="alert"`
// so a screen reader announces an error the moment it appears; successes use
// `role="status"`, which is polite rather than interrupting.
export default function FormAlert({
  tone = "error",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={`rounded-md border px-4 py-3 text-sm font-medium ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}
