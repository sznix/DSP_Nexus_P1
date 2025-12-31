import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/utils";
import { getSiteUrl, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";

// Create a Supabase client for server-side auth operations
function getSupabaseAuthClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

function jsonNoStore(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Cache-Control": "no-store" },
  });
}


type MagicLinkRequest = {
  email: string;
  redirectTo?: unknown;
};

export async function POST(request: Request) {
  try {
    // Basic body size guard (defense-in-depth)
    const MAX_BODY_BYTES = 10_000;
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return jsonNoStore({ error: "Request too large" }, { status: 413 });
    }

    // Parse and validate request body
    const body = await request.json() as MagicLinkRequest;
    const { email, redirectTo } = body;

    const redirectToStr =
      typeof redirectTo === "string" && redirectTo.length <= 2048
        ? redirectTo
        : null;

    if (!email || typeof email !== "string") {
      return jsonNoStore(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return jsonNoStore(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Get client IP for rate limiting
    const clientIp = getClientIp(request);

    // Check rate limit by IP
    const ipRateLimit = await checkRateLimit(`ip:${clientIp}`);
    if (!ipRateLimit.success) {
      return jsonNoStore(
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
      return jsonNoStore(
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
    const safeRedirect = safeNextPath(redirectToStr);

    // Construct the full redirect URL for the auth callback
    // SECURITY: Use SITE_URL instead of trusting request origin header
    // The origin header can be spoofed by attackers to redirect magic links to malicious sites
    const siteUrl = getSiteUrl();
    const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(safeRedirect)}`;

    // Send magic link via Supabase
    const supabase = getSupabaseAuthClient();
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
        return jsonNoStore(
          { error: "Too many requests. Please wait before trying again." },
          { status: 429 }
        );
      }

      return jsonNoStore(
        { error: "Failed to send magic link. Please try again." },
        { status: 500 }
      );
    }

    return jsonNoStore({
      success: true,
      message: "Magic link sent! Check your email.",
    });
  } catch (error) {
    console.error("[magic-link] Unexpected error:", error);
    return jsonNoStore(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

