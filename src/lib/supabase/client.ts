import { createBrowserClient } from "@supabase/ssr";

// Note: In browser context, we can't throw errors for missing env vars
// as they're injected at build time. The build will fail if they're missing.
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. " +
        "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY are set."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
