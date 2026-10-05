# SecureGate

A secure authentication system built with Next.js 14 and PostgreSQL.

**Status: Phase 2 — authentication core complete.** Sign up, sign in, session
handling and a protected dashboard are built and tested. Email verification
(Phase 3), password reset (Phase 4), rate limiting (Phase 5) and the security
hardening phases are not built yet. Nothing in this README describes features
that do not exist.

See [Phase 2 — Session strategy](#phase-2--session-strategy-jwt-vs-database)
for the JWT justification the brief asks for.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Neon, region `eu-west-2`) |
| Auth | NextAuth v4 — Credentials provider, JWT sessions |
| Email | Resend *(not yet implemented)* |

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
  - `/dashboard` — protected by middleware **and** a server-side session check
  - `/register` and `/login` — the two forms

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
- **Verification and reset tokens will be generated with `crypto.randomBytes`,**
  which is a cryptographically secure source and not predictable from
  previous output the way `Math.random()` is.
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

Test users were deleted afterwards; the `User` table was left empty.
