import { PrismaClient } from "@prisma/client";

// One Prisma client for the whole app.
//
// Next.js reloads modules on every file save during development. Creating a
// new PrismaClient each time leaks a fresh database connection pool, and
// Postgres will eventually refuse new connections.
//
// globalThis survives hot reloads, so we reuse the existing client instead of
// building a new one every save.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: ["query", "error", "warn"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}