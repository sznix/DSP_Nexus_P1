/**
 * Utility functions for the app
 */

/**
 * Get a required environment variable or throw a clear error
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please ensure it is set in your .env.local file or environment.`
    );
  }
  return value;
}

/**
 * Validates and sanitizes the "next" path parameter to prevent open redirects.
 * Only allows internal relative paths starting with "/".
 * Rejects absolute URLs, protocol-relative URLs, and paths not starting with "/app".
 */
export function safeNextPath(nextParam: string | null): string {
  const defaultPath = "/app";

  if (!nextParam) {
    return defaultPath;
  }

  // Reject if contains protocol (e.g., "https://evil.com" or "javascript:")
  if (nextParam.includes("://")) {
    return defaultPath;
  }

  // Reject protocol-relative URLs (e.g., "//evil.com")
  if (nextParam.startsWith("//")) {
    return defaultPath;
  }

  // Must start with "/"
  if (!nextParam.startsWith("/")) {
    return defaultPath;
  }

  // Optional: restrict to /app prefix for extra safety
  if (!nextParam.startsWith("/app")) {
    return defaultPath;
  }

  return nextParam;
}

/**
 * Get the configured timezone from environment or use default.
 * Can be overridden per-tenant in the future.
 */
export function getDefaultTimeZone(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? "America/Los_Angeles";
}

/**
 * Get today's date in YYYY-MM-DD format for a specific timezone.
 * Uses Intl.DateTimeFormat which is available in all modern environments.
 */
export function todayInTimeZone(timeZone?: string): string {
  const tz = timeZone ?? getDefaultTimeZone();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Format a date for display in a specific timezone
 */
export function formatDateForDisplay(timeZone?: string): string {
  const tz = timeZone ?? getDefaultTimeZone();
  return new Date().toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
