/**
 * Rate limiting utilities for API routes.
 * Uses Upstash Redis in production, falls back to in-memory Map in development.
 *
 * SECURITY: In production, rate limiting MUST fail closed (block requests)
 * when Redis is unavailable. This prevents abuse during Redis outages.
 */

// Rate limit configuration (configurable via environment)
const RATE_LIMIT_REQUESTS = parseInt(
  process.env.RATE_LIMIT_REQUESTS || "5",
  10
);
const RATE_LIMIT_WINDOW_MS =
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10); // Default: 15 minutes

// Production detection
const IS_PRODUCTION = process.env.NODE_ENV === "production";

type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
};

/**
 * In-memory rate limiter for development/fallback.
 * WARNING: This does NOT work correctly in serverless environments
 * where each request may hit a different instance.
 * TODO: Always use Redis in production.
 */
class InMemoryRateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const record = this.store.get(key);

    // Clean up expired entries periodically
    if (Math.random() < 0.1) {
      this.cleanup();
    }

    if (!record || now >= record.resetAt) {
      // First request or window expired
      this.store.set(key, {
        count: 1,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
      });
      return {
        success: true,
        remaining: RATE_LIMIT_REQUESTS - 1,
        reset: now + RATE_LIMIT_WINDOW_MS,
      };
    }

    if (record.count >= RATE_LIMIT_REQUESTS) {
      // Rate limited
      return {
        success: false,
        remaining: 0,
        reset: record.resetAt,
      };
    }

    // Increment count
    record.count++;
    return {
      success: true,
      remaining: RATE_LIMIT_REQUESTS - record.count,
      reset: record.resetAt,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton in-memory limiter (dev only)
const inMemoryLimiter = new InMemoryRateLimiter();

/**
 * Check rate limit for a given identifier.
 * Uses Upstash Redis if configured, otherwise falls back to in-memory.
 *
 * SECURITY: In production, this MUST use Redis. If Redis is not configured
 * in production, all requests are blocked (fail closed).
 */
export async function checkRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    // Use Upstash Redis
    return checkUpstashRateLimit(identifier, upstashUrl, upstashToken);
  }

  // SECURITY: In production, fail closed if Redis is not configured
  if (IS_PRODUCTION) {
    console.error(
      "[rate-limit] CRITICAL: Redis not configured in production. Blocking request (fail closed)."
    );
    return {
      success: false,
      remaining: 0,
      reset: Date.now() + RATE_LIMIT_WINDOW_MS,
    };
  }

  // Fallback to in-memory (dev only)
  console.warn(
    "[rate-limit] Using in-memory rate limiter. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production."
  );
  return inMemoryLimiter.check(identifier);
}

/**
 * Check rate limit using Upstash Redis REST API directly.
 * Uses sliding window algorithm.
 */
async function checkUpstashRateLimit(
  identifier: string,
  upstashUrl: string,
  upstashToken: string
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  try {
    // Use Redis sorted set for sliding window
    // 1. Remove old entries
    // 2. Add current request
    // 3. Count requests in window
    const pipeline = [
      ["ZREMRANGEBYSCORE", key, "0", String(windowStart)],
      ["ZADD", key, String(now), `${now}-${Math.random()}`],
      ["ZCARD", key],
      ["PEXPIRE", key, String(RATE_LIMIT_WINDOW_MS)],
    ];

    const response = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!response.ok) {
      console.error("[rate-limit] Upstash error:", await response.text());
      // SECURITY: Fail closed in production, fail open in development
      if (IS_PRODUCTION) {
        console.error("[rate-limit] Blocking request due to Redis error (fail closed)");
        return { success: false, remaining: 0, reset: now + RATE_LIMIT_WINDOW_MS };
      }
      return { success: true, remaining: RATE_LIMIT_REQUESTS, reset: now };
    }

    const results = await response.json();
    const count = results[2]?.result ?? 0;

    if (count > RATE_LIMIT_REQUESTS) {
      return {
        success: false,
        remaining: 0,
        reset: now + RATE_LIMIT_WINDOW_MS,
      };
    }

    return {
      success: true,
      remaining: RATE_LIMIT_REQUESTS - count,
      reset: now + RATE_LIMIT_WINDOW_MS,
    };
  } catch (error) {
    console.error("[rate-limit] Upstash error:", error);
    // SECURITY: Fail closed in production, fail open in development
    if (IS_PRODUCTION) {
      console.error("[rate-limit] Blocking request due to Redis error (fail closed)");
      return { success: false, remaining: 0, reset: now + RATE_LIMIT_WINDOW_MS };
    }
    return { success: true, remaining: RATE_LIMIT_REQUESTS, reset: now };
  }
}

/**
 * Get client IP from request headers.
 * Handles X-Forwarded-For header (takes first IP) and fallbacks.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
    // The first one is the original client IP
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  // Fallback for development
  return "127.0.0.1";
}
