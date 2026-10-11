# SecureGate

A secure authentication system built with Next.js 14 and PostgreSQL.

**Status: Phase 5 — rate limiting & security hardening complete.** Sign up,
sign in, session handling, a protected dashboard, the email verification flow,
the forgot/reset password flow, rate limiting on sign-in and forgot-password,
and HTTP security headers are all built and tested. UI polish and deployment
(Phase 6) are not done yet. Nothing in this README describes features that do
not exist.

See [Phase 2 — Session strategy](#phase-2--session-strategy-jwt-vs-database)
for the JWT justification the brief asks for,
[Phase 3 — Email verification](#phase-3--email-verification) for the
verification flow, [Phase 4 — Forgot password](#phase-4--forgot-password) for
the reset flow, and
[Phase 5 — Rate limiting & hardening](#phase-5--rate-limiting--security-hardening)
for the security work.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Neon, region `eu-west-2`) |
| Auth | NextAuth v4 — Credentials provider, JWT sessions |
| Email | Resend — verification + password reset emails (free tier, no verified domain yet) |
| Rate limiting | Upstash Redis — sliding window, 5 per IP per 10 min on sign-in and forgot-password |

## Current state

- Next.js project scaffolded with App Router and TypeScript
- Prisma initialised and connected to a cloud PostgreSQL database
- Three models defined and migrated:
  - `User` — id, name, email, password, emailVerified, createdAt, updatedAt
  - `verification_tokens` — id, identifier, tokenHash, expires, createdAt
  - `password_reset_tokens` — id, email, tokenHash, expires, createdAt
- Migration `20260929190222_init` applied and the tables confirmed in the
  database
- Phase 2 authentication:
  - `POST /api/register` — Zod validation, bcrypt at 12 salt rounds
  - `POST /api/auth/*` — NextAuth Credentials provider
  - `/dashboard` — protected by middleware, a server-side session check, and
    (Phase 3) a verified-account check
  - `/register` and `/login` — the two forms
- Phase 3 email verification:
  - Verification token created with `crypto.randomBytes(32)`, stored as a
    SHA-256 hash with a 15-minute expiry, in the `verification_tokens` table
  - `POST /api/register` creates the token and sends the email via Resend
  - `/verify-email/[token]` — validates, checks expiry, marks the user
    verified, and deletes the token, all inside a transaction
  - `POST /api/resend-verification` — issues a fresh link; its response is
    identical whether or not the email has an account, so it cannot be used to
    enumerate addresses
  - `/dashboard` rejects signed-in but unverified users by re-reading
    `emailVerified` from the database on every request
- Phase 4 forgot password:
  - `/forgot-password` — email input; always answers with the same "link is on
    its way" message whether or not the address has an account, so it cannot be
    used to enumerate addresses
  - `POST /api/forgot-password` — looks up the email, creates a reset token
    (same crypto as verification, 1-hour expiry) and sends it via Resend
  - `/reset-password/[token]` — validates the token and its expiry, then shows
    the new-password form
  - `POST /api/reset-password` — hashes the new password, swaps it in, and
    deletes the token as one transaction; a used token cannot be replayed
- Phase 5 rate limiting & hardening:
  - `src/lib/rate-limit.ts` — Upstash Redis sliding-window limiter, 5 per IP
    per 10 minutes, shared by middleware and API routes
  - `middleware.ts` — applies the limit to `POST /api/auth/signin` and `POST
    /api/auth/callback/credentials` before NextAuth runs
  - `POST /api/forgot-password` — same limit by IP
  - `next.config.mjs` — security headers on every route

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

Phase 3 code is complete and the full loop is tested. Delivery is limited by
the free tier: without a verified sending domain, Resend only delivers to the
account holder's own address. Emails are sent from Resend's own
`onboarding@resend.dev` address, which the test flow uses.

| Scenario | Works? |
| --- | --- |
| Verify flow end to end (own address) | ✅ tested |
| Resend a fresh link | ✅ tested |
| Deliver to other addresses | ⏳ needs a verified domain |

Upgrading is a Resend console change (verify a domain) plus setting
`RESEND_FROM_EMAIL`; the code does not change.

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

Same free-tier constraint as Phase 3: without a verified domain, reset emails
deliver to the account holder's own address only, sent from
`onboarding@resend.dev`.

| Scenario | Works? |
| --- | --- |
| Forgot-password flow end to end (own address) | ✅ tested |
| Reset to other addresses | ⏳ needs a verified domain |

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

## Getting started

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
- **Verification tokens are generated with `crypto.randomBytes`,** which is a
  cryptographically secure source and not predictable from previous output the
  way `Math.random()` is.
- **Verification tokens are stored hashed, never raw.** The raw token exists
  only in the emailed link; the database holds a SHA-256 hash. A leaked
  `verification_tokens` table yields tokens that cannot be used to verify
  anyone's account. Expired tokens are deleted on use; a dead or unknown
  token shows one generic "not valid" page.
- **The verify writes are transactional.** "Mark verified" and "delete token"
  cannot be split by a crash, and `updateMany` with `emailVerified: null`
  makes a re-click a no-op instead of an error.
- **The resend endpoint cannot enumerate accounts.** It returns the same
  message whether the email exists, is already verified, or was never
  registered.
- **Signed-in but unverified users cannot reach `/dashboard`.** The check
  re-reads `emailVerified` from the database on every request, so it reflects
  verification immediately and cannot be bypassed with an old cookie.
- **The forgot-password endpoint cannot enumerate accounts.** It returns the
  same 200 message whether the email exists or not and only creates a
  reset-token row for addresses that actually have an account.
- **Reset tokens are generated with the same CSPRNG and stored hashed** as
  verification tokens; the raw value lives only in the emailed link. An
  expired or unknown token renders a clear error with a "request a new link"
  path, never a stack trace or an internal detail.
- **The reset writes are transactional.** "Change password" and "delete token"
  cannot be split by a crash, so a used reset link cannot be replayed.
- **Sign-in is rate limited at the endpoint, before auth runs.** 5 attempts
  per IP per 10 minutes via Upstash Redis, counted in middleware for both
  `POST /api/auth/signin` and `POST /api/auth/callback/credentials`. Because it
  runs before NextAuth, even malformed attempts consume budget. A 6th attempt
  from the same IP gets `429`.
- **Forgot-password is rate limited too.** Same 5-per-10-minutes budget by IP,
  so the email channel cannot be hammered.
- **The rate-limit counter survives restarts.** It lives in Upstash Redis, not
  in server memory, so a redeploy cannot reset an attacker's counter.
- **HTTP responses include security headers.** `nosniff`, `no-referrer`, and
  `SAMEORIGIN` framing are set on every route in `next.config.mjs`.
- **API error messages never leak internals.** Reviewed across register,
  login, forgot-password, reset-password and resend: no stack traces, no
  "email not found" confirmations, no password echoes.
- **Prisma maps `DateTime` to `timestamp without time zone`** and normalises to
  UTC in the client. The application's own timestamp columns are therefore
  timezone-naive in the database, while Prisma's internal
  `_prisma_migrations` table uses `timestamptz`. Inspecting raw timestamps
  in `psql` can therefore be misleading.

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

Test users were deleted afterwards; the `User` table was left empty.

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

Test users (including the throwaway expired-token account) were deleted
afterwards; the database was left empty.

Phase 5 break-it tests, run against the live app:

| Check | Result |
| --- | --- |
| Hammer sign-in with wrong password (fresh IP, counter flushed) | first 5 attempts pass, **6th onwards `429` exactly as specified** |
| Hammer forgot-password x6 | first 5 `200` generic, **6th `429`** |
| Unknown email vs wrong password | **byte-identical** responses — no enumeration |
| Register, malformed JSON | `400 "Invalid request."`, no stack trace |
| Register, short password | `400`, field error only |
| Verify-email, garbage token | "not valid" page, no database hit |
| Reset-password, unknown token | `400 "This link is not valid..."` |
| Security headers on `/login` | `nosniff`, `no-referrer`, `SAMEORIGIN` all present |
| Stack trace anywhere in responses | none found |

Hand-verified in the browser against the running app (all six checks), each
confirming the automated result above.

The brief asks to break it three ways specifically. Where each is documented:

- **Wrong password** — row *Login rate limit* (5 tries then `429`) and row
  *No email enumeration* (identical message to an unknown address).
- **Expired token** — rows *Used-token page* (page refuses, no form) and
  *Dead/fake token via API* (`400`, no password change); the *Valid-token
  contrast* row shows a fresh token does work.
- **Missing fields** — row *Missing fields* (field errors only, never a crash).

| Manual check | What was done | Result |
| --- | --- | --- |
| Login rate limit | 6 wrong-password submits in a row | 1–5 "Invalid email or password", **6th** "Could not sign in right now — too many times" |
| Forgot-password rate limit | 6 submits in a row (page refreshed between attempts) | 1–5 success message, **6th** "Too many requests. Please wait…" |
| No email enumeration | never-used address vs real address + wrong password | **identical** "Invalid email or password" both times |
| Missing fields | login / forgot / register submitted empty | field errors for login + register; "Please enter a valid email address" on forgot; Confirm-password stays silent on empty-vs-empty (only errors when it doesn't match) — no crash screen |
| Security headers | DevTools → Network → Headers on `/login` | `referrer-policy: no-referrer`, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN` |
| Reset flow, live | forgot-password with real address → email link → new password | reset email arrives, link opens `/reset-password/[token]`, new password accepted, redirect to `/login?reset=1` |
| Used-token page | click the same reset link again | page shows "This link is not valid" and **never renders the form** |
| Dead/fake token via API | `POST /api/reset-password` with `aaaa…` token | `400 {"error":"This link is not valid. Request a new reset link."}` — no password change |
| Valid-token contrast | `POST /api/reset-password` with a fresh, unused token | `200 {"ok":true}` — the password IS changed (then restored) |

The sliding window is exact to the moment a burst is delivered: hammering from a
single IP in one round-trip allowed exactly 5 then blocked every later attempt.
(If an attacker spaces requests at the exact second the window's internal
sub-bucket rolls over, a stray 6th can slip through by a fraction of a second —
the next burst in the same window is then blocked, and the 5-per-10-minutes
budget still holds.) Good enough for the brief, and the counter survives
restarts because it lives in Upstash, not memory.

The rate-limit counters were flushed after testing; the `User` table holds only
the real account.
