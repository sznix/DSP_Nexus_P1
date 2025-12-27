import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
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
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Return the user to login page with error indicator
  const errorUrl = new URL("/login", request.url);
  errorUrl.searchParams.set("error", "auth_callback_error");
  return NextResponse.redirect(errorUrl);
}

