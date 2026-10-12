"use client";

import { useState } from "react";

import { passwordStrength, type Strength } from "@/lib/password-strength";

// ---------------------------------------------------------------------------
// TextField - label + input + (optional) eye toggle + (optional) strength
// meter + error text, all wired together for accessibility.
//
// Every form used to type its own <label>/<input>/<p> and re-derive the same
// class strings. This is the single definition, so every field looks and
// behaves the same.
//
// Accessibility wiring, which the duplicated version mostly lacked:
//   - <label htmlFor> ties the label to the input
//   - aria-invalid flags a field the user must fix
//   - aria-describedby points the input at its error and its strength meter,
//     so a screen reader reads them out with the field
// ---------------------------------------------------------------------------
export default function TextField({
  id,
  name,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  error,
  showStrength = false,
  labelAccessory,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  autoComplete?: string;
  error?: string;
  showStrength?: boolean;
  labelAccessory?: React.ReactNode;
}) {
  const [reveal, setReveal] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;

  const strengthId = `${id}-strength`;
  const errorId = `${id}-error`;

  // Only measure once the user has typed something, so an untouched field does
  // not sit there labelled "Weak".
  const strength: Strength | null =
    showStrength && value ? passwordStrength(value) : null;

  const describedBy =
    [strength ? strengthId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-slate-700">
          {label}
        </label>
        {labelAccessory}
      </div>

      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          type={inputType}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            isPassword ? "pr-12" : ""
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((previous) => !previous)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700 focus:outline-none"
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>

      {strength && (
        <StrengthMeter id={strengthId} level={strength} />
      )}

      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

const STRENGTH_STYLES: Record<
  Strength,
  { label: string; bar: string; width: string; text: string }
> = {
  weak: { label: "Weak", bar: "bg-red-500", width: "w-1/3", text: "text-red-600" },
  fair: { label: "Fair", bar: "bg-amber-500", width: "w-2/3", text: "text-amber-600" },
  strong: { label: "Strong", bar: "bg-green-600", width: "w-full", text: "text-green-700" },
};

function StrengthMeter({ id, level }: { id: string; level: Strength }) {
  const style = STRENGTH_STYLES[level];

  return (
    <div id={id} className="mt-1" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${style.bar} ${style.width}`} />
      </div>
      <p className={`mt-1 text-xs font-semibold ${style.text}`}>
        Password strength: {style.label}
      </p>
    </div>
  );
}

// lucide-react icons. aria-hidden because the button already carries the
// accessible name via aria-label.
import { Eye, EyeOff } from "lucide-react";

function EyeIcon() {
  return <Eye className="h-4 w-4" aria-hidden="true" />;
}

function EyeOffIcon() {
  return <EyeOff className="h-4 w-4" aria-hidden="true" />;
}
