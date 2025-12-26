import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/utils";

// Create a Supabase client for server-side auth operations
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

type MagicLinkRequest = {
  email: string;
  redirectTo: string;
};

export async function POST(request: Request) {
  try {
    // Parse and validate request body
    const body = await request.json() as MagicLinkRequest;
    const { email, redirectTo } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Get client IP for rate limiting
    const clientIp = getClientIp(request);

    // Check rate limit by IP
    const ipRateLimit = await checkRateLimit(`ip:${clientIp}`);
    if (!ipRateLimit.success) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait before trying again.",
          retryAfter: Math.ceil((ipRateLimit.reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((ipRateLimit.reset - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    // Check rate limit by email (prevents targeting specific email)
    const emailRateLimit = await checkRateLimit(`email:${sanitizedEmail}`);
    if (!emailRateLimit.success) {
      return NextResponse.json(
        {
          error: "Too many requests for this email. Please wait before trying again.",
          retryAfter: Math.ceil((emailRateLimit.reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((emailRateLimit.reset - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    // Validate and sanitize redirect path
    const safeRedirect = safeNextPath(redirectTo || null);

    // Construct the full redirect URL for the auth callback
    const origin = request.headers.get("origin") || "";
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeRedirect)}`;

    // Send magic link via Supabase
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.signInWithOtp({
      email: sanitizedEmail,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      console.error("[magic-link] Supabase error:", error.message);

      // Don't expose internal errors to client
      if (error.message.includes("rate")) {
        return NextResponse.json(
          { error: "Too many requests. Please wait before trying again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "Failed to send magic link. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Magic link sent! Check your email.",
    });
  } catch (error) {
    console.error("[magic-link] Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
