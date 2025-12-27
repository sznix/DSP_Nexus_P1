import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Defense-in-depth: rate limit auth callbacks by IP to reduce abuse
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`auth-callback:ip:${clientIp}`);
  if (!rl.success) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("error", "rate_limited");
    const res = NextResponse.redirect(errorUrl);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }


  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  // Validate and sanitize the redirect path to prevent open redirects
  const safePath = safeNextPath(nextParam);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Build safe redirect URL using request.url as base
      const redirectUrl = new URL(safePath, request.url);
      const res = NextResponse.redirect(redirectUrl);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  }

  // Return the user to login page with error indicator
  const errorUrl = new URL("/login", request.url);
  errorUrl.searchParams.set("error", "auth_callback_error");
  const res = NextResponse.redirect(errorUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

