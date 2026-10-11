import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Phase 5 - rate limiting via Upstash Redis.
//
// The brief asks for "maximum 5 attempts per IP per 10 minutes" on both the
// sign-in endpoint and the forgot-password endpoint.
//
// Why Upstash rather than an in-memory Map: an in-memory counter lives inside
// the running server. The moment the server restarts (a deploy, a crash, a
// redeploy on Vercel) the counter is empty, so an attacker only has to wait
// for a restart to get 5 more attempts. Upstash Redis keeps the count in a
// database outside the app, so the counter survives restarts and works the
// same on localhost and on Vercel's serverless functions.
//
// Ratelimit.slidingWindow(5, "10 m") means: at most 5 requests in any rolling
// 10-minute window. The sliding variant (rather than a fixed windows that
// restart on the clock hour) is what makes "per 10 minutes" accurate - a user
// who makes 5 attempts at 11:59 and 5 more at 12:00 with a fixed window would
// get 10 through; with sliding they cannot.
// ---------------------------------------------------------------------------

// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// automatically. Constructing it is cheap; the limiter is created at import
// time so both the middleware and the API routes share one instance.
const redis = Redis.fromEnv();

export const loginLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:login",
  limiter: Ratelimit.slidingWindow(5, "10 m"),
});

export const forgotPasswordLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:forgot",
  limiter: Ratelimit.slidingWindow(5, "10 m"),
});

/**
 * Extracts the client IP from the request.
 *
 * Next.js (and Vercel) put the real client IP in the X-Forwarded-For header.
 * The first value is the client originally connecting; anything after it was
 * appended by proxies. The value comes from the client itself, so it is
 * spoofable - a determined attacker can rotate X-Forwarded-For. That is a
 * known limitation of IP-based rate limiting (an attacker behind a NAT or a
 * botnet shares or changes IPs easily) and it is why the limit is on the
 * endpoint, not the identity. On Vercel the header is trustable because the
 * edge network writes it.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}