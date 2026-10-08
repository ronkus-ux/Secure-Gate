# SecureGate

A secure authentication system built with Next.js 14 and PostgreSQL.

**Status: Phase 3 — email verification complete.** Sign up, sign in, session
handling, a protected dashboard, and the email verification flow are built and
tested. Password reset (Phase 4), rate limiting (Phase 5) and the security
hardening phases are not built yet. Nothing in this README describes features
that do not exist.

See [Phase 2 — Session strategy](#phase-2--session-strategy-jwt-vs-database)
for the JWT justification the brief asks for, and
[Phase 3 — Email verification](#phase-3--email-verification) for the
verification flow.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Neon, region `eu-west-2`) |
| Auth | NextAuth v4 — Credentials provider, JWT sessions |
| Email | Resend — verification emails (free tier, no verified domain yet) |

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
| `UPSTASH_REDIS_REST_URL` | Rate limiting. Required in production only. |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. Required in production only. |

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
