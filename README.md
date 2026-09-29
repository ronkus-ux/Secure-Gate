# SecureGate

A secure authentication system built with Next.js 14 and PostgreSQL.

**Status: Phase 1 — scaffold and database schema only.** The schema and its
migration are complete and applied. Authentication, email verification and
password reset are not built yet. Nothing in this README describes features
that do not exist.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Neon, region `eu-west-2`) |
| Auth | NextAuth v4 *(not yet implemented)* |
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

- Passwords will be hashed with bcrypt; plaintext passwords are never stored.
- Verification and reset tokens will be generated with `crypto.randomBytes`,
  which is a cryptographically secure source and not predictable from
  previous output the way `Math.random()` is.
- Prisma maps `DateTime` to `timestamp without time zone` and normalises to
  UTC in the client. The application's own timestamp columns are therefore
  timezone-naive in the database, while Prisma's internal
  `_prisma_migrations` table uses `timestamptz`. Inspecting raw timestamps
  in `psql` can therefore be misleading.
