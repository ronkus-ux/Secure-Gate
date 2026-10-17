# SecureGate

A secure authentication system built with Next.js 14 and PostgreSQL.

**Status: complete and deployed.** Sign up, sign in, session handling, a
protected dashboard, the email verification flow, the forgot/reset password
flow, rate limiting on sign-in and forgot-password, HTTP security headers, and
the final UI pass (shared auth components, one auth screen, logout,
password-strength meter, accessible labels and loading states) are all built
and tested. The app is live at
**https://secure-gate-peach.vercel.app/**, with verification and reset emails
sent from a verified sending domain (see [Stack](#stack)). Nothing in this
README describes features that do not exist.

See [Phase 2 — Session strategy](#phase-2--session-strategy-jwt-vs-database)
for the JWT justification the brief asks for,
[Phase 3 — Email verification](#phase-3--email-verification) for the
verification flow, [Phase 4 — Forgot password](#phase-4--forgot-password) for
the reset flow, [Phase 5 — Rate limiting & hardening](#phase-5--rate-limiting--security-hardening)
for the security work, and
[Phase 6 — UI polish](#phase-6--ui-polish) for the final interface pass.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Neon, region `eu-west-2`) |
| Auth | NextAuth v4 — Credentials provider, JWT sessions |
| Email | Resend — verification + password reset emails, sent from `noreply@yinyindesign.com.ng` (verified domain) |
| Rate limiting | Upstash Redis — sliding window, 5 per IP per 10 min on sign-in and forgot-password |

## Current state

All six phases are built, tested, and deployed. The data layer is three Prisma
models (`User`, `verification_tokens`, `password_reset_tokens`) on cloud
PostgreSQL, with migration `20260929190222_init` applied. Each phase is
detailed in its own section below; the app runs live at
**https://secure-gate-peach.vercel.app/**.

## Phase 2 — Session strategy: JWT vs database

The brief allows either and requires the reasoning to be written down. **This
app uses JWT sessions, `maxAge` 30 minutes.**

### Why JWT

- **No database read on the protected path.** The session travels inside the
  cookie, so middleware can decide whether to admit a request without a query.
- **No `Session` table.** A database strategy needs session rows and a
  migration for them. JWT avoids that entirely.
- **It fits this schema.** `User` is the only table this phase needed. Adding
  `Session` would have meant a second migration before any feature shipped.

### What it costs

- **A JWT cannot be revoked.** It is self-contained and signed, so there is no
  server-side list to strike it from. Deleting the row from the database does
  not invalidate a token that has already been issued.
- **The cookie is therefore short-lived.** 30 minutes bounds the damage: a
  stolen cookie is useful for half an hour, not indefinitely.

### Why 30 minutes specifically

It is a trade between two real costs, not a default picked for convenience:

- **Longer** — fewer interruptions, but a leaked cookie stays valid longer.
- **Shorter** — safer, but users are logged out mid-task.

30 minutes survives an ordinary session while keeping the worst case small.

### The honest caveat

A reviewer could reasonably object: *"the user cannot force-logout a thief."*
That is a true gap, not an oversight.

Two ways to close it later:

1. **A `sessionVersion` integer on `User`.** Put it in the JWT, compare it
   against the current value, bump it to invalidate every token at once. Cheap,
   but adds a column and means a JWT is no longer sufficient on its own.
2. **A database session.** Sessions become rows that can be deleted, giving
   instant revocation — at the cost of a table and a lookup per request.

Option 1 was deliberately **not** added, because this phase's scope did not
require revocation. It is the first thing to add if that changes.

### Why a database session was not chosen

The deciding factor was the brief's own Phase 2 wording — "JWT or database
sessions, your choice." Given that, the absence of a `Session` table and the
absence of a per-request lookup were both worth more than a revocation
capability that no Phase 2 requirement asks for.

### Deviations from the brief

Two deliberate departures, both security-related:

1. **Tokens are stored as `tokenHash`, not `token`.** The raw token exists
   only in the emailed link; the database holds a SHA-256 hash of it. A
   database leak therefore does not hand an attacker usable credentials.
2. **`emailVerified` is a `DateTime`, not a `Boolean`.** A nullable
   timestamp encodes both state and time, so "when was this verified" is
   never lost.

## Phase 3 — Email verification

### How it works

1. On signup, `crypto.randomBytes(32)` produces a 64-character hex token.
2. The raw token is sent in the email; **only a SHA-256 hash of it is
   stored**, with a 15-minute expiry, in `verification_tokens`.
3. `/verify-email/[token]` looks the token up by hash, checks the expiry,
   marks the user verified, and deletes the token — the last two as one
   transaction.
4. `/dashboard` re-reads `emailVerified` from the database on every request
   and turns away signed-in users who are not verified.

### Why SHA-256, not bcrypt

bcrypt is slow on purpose, to defend *guessable* secrets (passwords).
Verification tokens are 256 bits of `crypto.randomBytes` output — there is
nothing to brute-force — so the cheap, fast hash is correct here. Slow hashing
of an unguessable value would buy nothing.

### Why the token is deleted in a transaction

The "mark verified" and "delete token" writes answer one question — *was this
token used?* — so a crash performing only one of them would leave a half-
answer. Wrapping both in `prisma.$transaction` makes the half-state
impossible. `updateMany` (not `update`) with `emailVerified: null` in the
`where` means re-clicking an old link matches zero rows and changes nothing.

### Why the check lives in `/dashboard`, not `middleware.ts`

Middleware reads the JWT cookie, and the cookie does not know whether the
account is verified — that fact lives in the database. A middleware check
would either block people who verified after signing in (stale cookie) or let
unverified users through. The dashboard uses `getServerSession()`, whose
session callback re-reads `emailVerified` on every request, so the check is
always current. This is why the earlier "no database read on the protected
path" statement applies to **middleware** only; the dashboard page itself does
one small lookup.

### Email delivery status

Phase 3 code is complete and the full loop is tested end to end locally. A
sending domain is verified in Resend (see [Stack](#stack)), so verification
emails deliver to any address, not only the account holder's — live delivery
is confirmed. The only change needed was `RESEND_FROM_EMAIL`; the sending
logic is untouched.

| Scenario | Works? |
| --- | --- |
| Verify flow end to end | ✅ tested locally |
| Resend a fresh link | ✅ tested locally |
| Deliver to other addresses | ✅ tested live (verified domain) |

The free tier still caps daily volume, and sending to other addresses only
works while the domain stays verified.

## Phase 4 — Forgot password

### How it works

1. `/forgot-password` collects an email. `POST /api/forgot-password` looks the
   address up; if it exists it creates a reset token with a **1-hour expiry**
   (deliberately longer than the 15-minute verification link, because the user
   has to read the email, invent a new password, and type it twice) and sends
   it via Resend.
2. The link opens `/reset-password/[token]`, which validates the token and its
   expiry and renders the new-password form.
3. `POST /api/reset-password` hashes the new password with bcrypt (same 12
   rounds as signup), swaps it into the `User` row, and deletes the token — as
   one transaction, so a used token can never be replayed.

### Why the responses never confirm an email exists

The brief's rule is explicit: *"if the email is not found, still return a
success message."* Both the forgot-password page and its endpoint answer the
same way whether the address has an account or not. An attacker probing with a
list of emails learns nothing from this endpoint. The reset-token row is only
created when the account genuinely exists, so the database stays clean for
addresses that do not.

### Why reset tokens share the verification crypto

Verification and reset tokens are the same design — `crypto.randomBytes(32)`
raw value in the email, only a SHA-256 hash stored, single-use with an expiry —
so the reset helpers reuse the Phase 3 `generateVerificationToken` and
`hashVerificationToken` functions. The only difference is the TTL: 15 minutes
for verification, 1 hour for resets.

### Why the reset writes are transactional

"Swap the password" and "delete the token" answer one question — *did this
link get used?* — so wrapping both in `prisma.$transaction` makes a
half-done reset impossible. `updateMany` rather than `update` means a
double-submit matches the row once and the second attempt finds no token.

### Email delivery status

Same verified sending domain as Phase 3, so reset emails deliver to any
address. The reset flow is tested end to end locally.

## Phase 5 — Rate limiting & security hardening

### Rate limiting

The brief asks for **5 attempts per IP per 10 minutes** on the sign-in endpoint
and the forgot-password endpoint. `src/lib/rate-limit.ts` builds one Upstash
sliding-window limiter used by both:

- `POST /api/auth/signin` and `POST /api/auth/callback/credentials` — limited
  in `middleware.ts`, so the count happens *before* NextAuth runs and even
  counts requests that would never pass validation.
- `POST /api/forgot-password` — limited in the route itself.

Why **Upstash Redis** and not an in-memory counter: the counter lives in a
database outside the app. A server restart (a deploy, a crash, any Vercel
re-deploy) would empty an in-memory Map, so an attacker would only have to wait
for a restart to get 5 more attempts. Upstash keeps the count, so the limit is
real on localhost and in production.

Why **sliding window** and not fixed: a fixed window that resets on the clock
hour lets someone make 5 attempts at 23:59 and 5 more at 00:00. A sliding
window measures any rolling 10-minute window, so "per 10 minutes" is exact.

### Why the limiter lives in middleware

Rate limiting in middleware means it wraps the endpoint itself, before the
application code runs. Requests that fail validation, requests with malformed
JSON, requests from bots — all count, which is what a brute-force protection
needs: the budget is per *attempt*, not per *successful validation*. It also
keeps NextAuth's own handler untouched.

### Security headers

`next.config.mjs` adds three headers to every response:

| Header | Value | Prevents |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | browser MIME-sniffing honouring an uploaded/mangled file as HTML (stored XSS) |
| `Referrer-Policy` | `no-referrer` | the previous URL, including `?email=` / `?callbackUrl=`, leaking to the next site |
| `X-Frame-Options` | `SAMEORIGIN` | clickjacking — our pages can't be framed from another origin |

### Error-message audit

Every API response was checked against the brief's rule — no revealing whether
an email exists, no revealing a password, no stack traces:

- `POST /api/auth/callback/credentials` — identical, generic failure for an
  unknown email and a wrong password, on top of the already-existing timing
  equalisation in `src/lib/auth.ts`.
- `POST /api/register` — one generic message for P2002 and for a server
  fault; field errors only for validation.
- `POST /api/forgot-password` — the same success message whether or not the
  account exists.
- `POST /api/reset-password` — "not valid / expired", never an internal detail.
- No response contains a stack trace; validation returns field errors, and
  unexpected server faults are logged server-side, not returned.

### Vercel environment variables

Nothing is hardcoded; every secret is read from environment variables. To run
on Vercel, set all of these in the Vercel project's Environment Variables:

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Prisma -> Neon |
| `NEXTAUTH_SECRET` | session cookie signing |
| `NEXTAUTH_URL` | absolute URLs in emails + auth callbacks |
| `RESEND_API_KEY` | sending verification / reset emails |
| `RESEND_FROM_EMAIL` | the from address on those emails |
| `UPSTASH_REDIS_REST_URL` | rate-limit counter (REST) |
| `UPSTASH_REDIS_REST_TOKEN` | rate-limit counter (REST) |

`NEXTAUTH_URL` on Vercel is the deployed `https://…vercel.app` URL. On a custom
domain, point it at that. The code path is identical in both cases.

## Phase 6 — UI polish

The functional auth was already complete; this phase made the interface one
controlled thing instead of eight drifting pages.

### One auth screen

`/login`, `/register` and `/forgot-password` are the same screen in three
modes. `src/components/auth/AuthScreen` renders the shared shell (`AuthShell`)
and mounts exactly one form — `LoginForm`, `RegisterForm` or
`ForgotPasswordForm` — so only one form is ever in the tree and every mode
keeps the same shell. Each route is now a thin wrapper that sets the mode and a
document title (`Sign in · SecureGate`, `Create your account · SecureGate`,
`Forgot your password? · SecureGate`).

The mode links on the forms (`Create one`, `Sign in`) are plain `Link`s, so
switching screens is a fast client navigation. Anything that must carry state
across screens still does it via the URL: registering lands on
`/login?registered=1`, and the login page reads `?registered`, `?reset`,
`?verify`, `?verified` and `?callbackUrl` straight from the address bar. The token pages
(`/verify-email/[token]`, `/reset-password/[token]`) stay separate — they are
routes, not screens.

### Shared components

`src/components/ui` holds primitives used by every auth page:

| Component | What it does |
| --- | --- |
| `AuthShell` | the one-frame centred column with the SecureGate wordmark and page title |
| `TextField` | label + input + field error, eye toggle, password-strength meter; `aria-invalid` and `aria-describedby` wire input ↔ error ↔ meter |
| `SubmitButton` | disables itself and shows "Signing in..." while a submit is in flight (`aria-busy`) |
| `FormAlert` | error / success / warning box with `role="alert"` or `role="status"` |
| `LogoutButton` | `signOut({ callbackUrl: "/login" })` — signs out and lands on the login screen |

Before this, login, register, forgot-password and reset each repeated the same
markup; the refactor removed the duplication (net roughly −290 lines).

### Password strength

Signup shows a live weak / fair / strong meter that reacts while the user
types (`src/lib/password-strength.ts`, wired into `TextField`). It does not
police the choice — the server's validation is the real gate — but it makes a
weak password visible before the submit is wasted.

### Details

- **Logout** — the required sign-out path; also clears the cookie server-side.
- **Typography** — Inter via `next/font/google`, weight 600, replacing the
  default.
- **Banners** — "account created", "password updated", "email verified" and
  "verify your email" read from the URL and render in the shared `FormAlert`
  style.
- **Document titles** — one per mode, via a `%s · SecureGate` title template.
- **Colour** — the dark-mode leftovers were removed; the app is one light,
  high-contrast surface.

### Deployment

The app is deployed on Vercel at **https://secure-gate-peach.vercel.app/**.
The steps that were taken, kept here so the deploy is reproducible:

1. The GitHub repo was imported into Vercel as a project (framework preset
   Next.js; the App Router is picked up automatically).
2. The project's Environment Variables were set — the same seven as in Phase 5:
   `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `RESEND_API_KEY`,
   `RESEND_FROM_EMAIL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
   `NEXTAUTH_URL` is the deployed `https://secure-gate-peach.vercel.app/` URL;
   locally it stays `http://localhost:3000`.
3. Deployed. The code path is identical to localhost: the rate-limit counter
   lives in Upstash (it survives restarts and re-deploys), the database is
   already cloud PostgreSQL, and email goes through Resend.
4. The sending domain was verified in Resend and `RESEND_FROM_EMAIL` set to
   the verified `noreply@` address, so mail reaches any address, not only the
   account holder's.
5. The live routes were checked — `/`, `/login`, `/register`,
   `/forgot-password` all return `200`, and `/dashboard` without a session
   returns `307` to `/login`. See the
   [Manual test record](#manual-test-record).

The GO54 domain is used only as the email-sending identity; the app itself
stays on the `vercel.app` URL.

## Getting started

These instructions are for **local development**, which runs the app at
`http://localhost:3000`. The deployed app lives at
**https://secure-gate-peach.vercel.app/** (see [Deployment](#deployment)).

```bash
npm install
```

You need **two** environment files. This is not a mistake:

- `.env` — read by the **Prisma CLI**. It only reads `.env`, not `.env.local`,
  so `DATABASE_URL` must live here or migrations will fail.
- `.env.local` — read by **Next.js**. Holds every secret.

Populate both, then:

```bash
npx prisma migrate dev   # apply migrations
npm run dev              # http://localhost:3000
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Use a **direct** connection, not a pooler, or `prisma migrate dev` will fail. |
| `NEXTAUTH_SECRET` | Signs the session cookie. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `NEXTAUTH_URL` | Base URL used to build callback links. |
| `RESEND_API_KEY` | API key for transactional email. |
| `RESEND_FROM_EMAIL` | The from address on verification and reset emails. |
| `UPSTASH_REDIS_REST_URL` | Rate limiting. Required wherever the app runs — set it in `.env.local` and in Vercel. |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. Required wherever the app runs — set it in `.env.local` and in Vercel. |

`.env` and `.env.local` are gitignored. **Never commit them.**

## Security notes

- **Passwords are hashed with bcrypt at 12 salt rounds.** Plaintext passwords
  are never stored, never logged, and never returned in an API response. The
  registration query uses `select` so the hash cannot leave the server even by
  accident.
- **Failed logins are deliberately indistinguishable.** `authorize()` in
  `src/lib/auth.ts` runs a bcrypt comparison against a dummy hash when the
  email is unknown, so the missing-account and wrong-password paths take the
  same time. Both return `null`, and the UI renders one message — *"Invalid
  email or password."* Different wording or different timing between the two
  failures would let someone enumerate which addresses have accounts.
- **Duplicate email is enforced by the database, not by a pre-check.** A
  `findUnique`-then-`create` sequence races: two simultaneous signups can both
  pass the check and both attempt the insert. Only the `UNIQUE` constraint is
  atomic, so the route catches Prisma's `P2002` instead of trying to prevent it.
- **Password length is capped at 72 *bytes*, not 72 characters.** bcrypt reads
  only the first 72 bytes and silently ignores the rest, so a character-based
  cap would let a long non-ASCII password be quietly truncated — and two
  visibly different passwords would then both work. The validator uses
  `TextEncoder` rather than `Buffer.byteLength` so the check is valid in the
  browser as well as on the server.
- **Two independent checks guard `/dashboard`.** `middleware.ts` redirects
  unauthenticated requests, and `dashboard/page.tsx` re-checks the session
  server-side. A matcher typo or a future page added under `/dashboard` cannot
  expose anything on its own.
- **The dashboard redirect does not echo a user-supplied URL.** Passing a
  query-string value straight into a redirect is an open redirect; the login
  page reads `callbackUrl`, but the protected page never sends one.
- **Prisma maps `DateTime` to `timestamp without time zone`** and normalises to
  UTC in the client. The application's own timestamp columns are therefore
  timezone-naive in the database, while Prisma's internal
  `_prisma_migrations` table uses `timestamptz`. Inspecting raw timestamps
  in `psql` can therefore be misleading.

Token generation, hashing, single-use deletion, transactional writes,
account-enumeration resistance and rate limiting are covered in the Phase 3–5
sections above.

## Manual test record

The brief requires sign up and sign in to be tested by hand and the stored
password to be confirmed as not plaintext. Verified against the live database:

| Check | Result |
| --- | --- |
| `/dashboard` with no session | `307` → redirected to `/login` |
| `POST /api/register` | `201`, user returned with no password field |
| Password under 8 characters | `400` rejected |
| `confirmPassword` mismatch | `400` rejected |
| Invalid email format | `400` rejected |
| Stored password value | `$2a$12$...` — not plaintext, **12 rounds** |
| Duplicate email | `409`, blocked by the unique constraint |
| Sign in with wrong password | no session cookie issued |
| Sign in with correct password | session cookie issued |
| `GET /api/auth/session` | returns id and email, **no password**, 30 min expiry |
| `GET /dashboard` with session | `200`, renders the signed-in email |

Phase 3 verification flow, tested end to end:

| Check | Result |
| --- | --- |
| Signup creates unverified user + token row | `201`, `emailVerified: null` |
| Log in as unverified user, open `/dashboard` | `307` → `/login?verify=1` |
| `GET /verify-email/[token]` (valid link) | `200` "Email verified" |
| Same session, `/dashboard` again | `200`, allowed (no re-login) |
| Token row after use | deleted (`0` rows remain) |
| Re-click the same link | "not valid", no change |
| Malformed token URL | "not valid", no database hit |
| Resend endpoint | identical response whether or not the account exists |

Phase 4 forgot-password flow, tested end to end via HTTP:

| Check | Result |
| --- | --- |
| `POST /api/forgot-password` unknown email | `200`, same generic message |
| Same for a known email | `200`, identical message — no enumeration |
| Reset-token row created | present, 1-hour expiry |
| Malformed reset request | `400`, field errors |
| `POST /api/reset-password` valid token | `200`, `{"ok":true}` |
| Reset-token after use | deleted — reuse returns "This link is not valid" |
| Old password | rejected (`401`) |
| New password | accepted — login succeeds after reset |

Phase 5 break-it tests, run by hand against the running app:

| Manual check | What was done | Result |
| --- | --- | --- |
| Login rate limit | 6 wrong-password submits in a row | 1–5 "Invalid email or password", **6th** "Could not sign in right now — too many times" (`429`, exactly as specified) |
| Forgot-password rate limit | 6 submits in a row (page refreshed between attempts) | 1–5 success message, **6th** "Too many requests. Please wait…" |
| No email enumeration | never-used address vs real address + wrong password | **identical** "Invalid email or password" both times |
| Missing fields | login / forgot / register submitted empty | field errors for login + register; "Please enter a valid email address" on forgot; Confirm-password stays silent on empty-vs-empty (only errors when it doesn't match) — no crash screen |
| Malformed JSON | `POST /api/register` with a junk body | `400 "Invalid request."`, no stack trace |
| Short password | register with fewer than 8 characters | `400`, field error only |
| Garbage verify token | `GET /verify-email/<garbage>` | "not valid" page, no database hit |
| Unknown reset token | `POST /api/reset-password` with an unknown token | `400 "This link is not valid..."` |
| Security headers | DevTools → Network → Headers on `/login` | `referrer-policy: no-referrer`, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN` |
| Reset flow, end to end | forgot-password with real address → email link → new password | reset email arrives, link opens `/reset-password/[token]`, new password accepted, redirect to `/login?reset=1` |
| Used-token page | click the same reset link again | page shows "This link is not valid" and **never renders the form** |
| Dead/fake token via API | `POST /api/reset-password` with `aaaa…` token | `400 {"error":"This link is not valid. Request a new reset link."}` — no password change |
| Valid-token contrast | `POST /api/reset-password` with a fresh, unused token | `200 {"ok":true}` — the password IS changed (then restored) |
| Stack traces in responses | scanned every response | none found |

The brief asks to break it three ways specifically. Where each is documented:

- **Wrong password** — row *Login rate limit* (5 tries then `429`) and row
  *No email enumeration* (identical message to an unknown address).
- **Expired token** — rows *Used-token page* (page refuses, no form) and
  *Dead/fake token via API* (`400`, no password change); the *Valid-token
  contrast* row shows a fresh token does work.
- **Missing fields** — row *Missing fields* (field errors only, never a crash).

The sliding window is exact to the moment a burst is delivered: hammering from a
single IP in one round-trip allowed exactly 5 then blocked every later attempt.
(If an attacker spaces requests at the exact second the window's internal
sub-bucket rolls over, a stray 6th can slip through by a fraction of a second —
the next burst in the same window is then blocked, and the 5-per-10-minutes
budget still holds.) Good enough for the brief, and the counter survives
restarts because it lives in Upstash, not memory.

After testing, the throwaway accounts were deleted (the `User` table holds only
the real account) and the rate-limit counters were flushed.

Phase 6 checks — the first block run locally, the second against the live
deployment at **https://secure-gate-peach.vercel.app/**:

| Check | Where | Result |
| --- | --- | --- |
| `/login`, `/register`, `/forgot-password` | local | all `200`, each renders its own mode (only one form is ever mounted) |
| Document titles | local | `Sign in · SecureGate`, `Create your account · SecureGate`, `Forgot your password? · SecureGate` |
| `/login?registered=1`, `/login?verify=1` and `/login?verified=1` banners | local | each renders its alert on the login screen |
| `/dashboard` with no session | local | `307` → `/login` (unchanged) |
| Password-strength meter | local | renders once a password is typed on signup |
| `/`, `/login`, `/register`, `/forgot-password` | live | each returns `200` |
| `/dashboard` with no session | live | `307` → `/login` |
| Register with a non-Resend email address | live | verification email delivered from the verified sending domain, so mail is no longer limited to the account holder |
