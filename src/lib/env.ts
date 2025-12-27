/**
 * Centralized environment variable access.
 *
 * Goal: keep server-only code from depending on NEXT_PUBLIC_* where possible,
 * while staying backward-compatible (fallbacks) during migration.
 */

export function getRequiredEnvAny(names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v && v.trim().length > 0) return v;
  }
  throw new Error(
    `Missing required environment variable. Tried: ${names.join(", ")}`
  );
}

/**
 * Supabase URL for server-side usage.
 * Prefer SUPABASE_URL (server-only), fallback to NEXT_PUBLIC_SUPABASE_URL.
 */
export function getSupabaseUrl(): string {
  return getRequiredEnvAny(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
}

/**
 * Supabase ANON key for server-side usage.
 * Prefer SUPABASE_ANON_KEY (server-only), fallback to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY.
 *
 * Note: The anon key is not a secret, but using server-only env names makes intent clearer.
 */
export function getSupabaseAnonKey(): string {
  return getRequiredEnvAny([
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  ]);
}

/**
 * Site URL used to build absolute redirects in auth emails.
 * Prefer SITE_URL (server-only), fallback to NEXT_PUBLIC_SITE_URL.
 */
export function getSiteUrl(): string {
  return getRequiredEnvAny(["SITE_URL", "NEXT_PUBLIC_SITE_URL"]);
}
