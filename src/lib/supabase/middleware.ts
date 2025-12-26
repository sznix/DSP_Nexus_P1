import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredEnv } from "@/lib/utils";

/**
 * Determines if a path requires authentication check.
 * Only check claims for:
 * - Protected paths (/app/*)
 * - Login page (to redirect authenticated users away)
 */
function requiresAuthCheck(pathname: string): boolean {
  return pathname.startsWith("/app") || pathname === "/login";
}

/**
 * Determines if a path is a public route (no authentication required).
 * Strict list: only root, login, and auth callback paths.
 */
function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/auth/")
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const {
    nextUrl: { pathname, search },
  } = request;

  // Skip auth check entirely for routes that don't need it (performance optimization)
  if (!requiresAuthCheck(pathname)) {
    return supabaseResponse;
  }

  // Stash cookies that need to be set on any response (including redirects)
  let cookiesToSetOnResponse: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Stash cookies for later application to redirects
          cookiesToSetOnResponse = cookiesToSet.map(
            ({ name, value, options }) => ({
              name,
              value,
              options: options as Record<string, unknown>,
            })
          );

          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session using getClaims - this validates and refreshes the token
  const { data: claimsData, error } = await supabase.auth.getClaims();

  // Helper function to apply stashed cookies to a redirect response
  const applyStashedCookies = (response: NextResponse): NextResponse => {
    cookiesToSetOnResponse.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  // If not authenticated and trying to access protected route, redirect to login
  // Include the original path as ?next= parameter for post-login redirect
  if (!isPublicRoute(pathname) && (error || !claimsData)) {
    const url = request.nextUrl.clone();
    const originalPath = pathname + search;
    url.pathname = "/login";
    url.searchParams.set("next", originalPath);
    return applyStashedCookies(NextResponse.redirect(url));
  }

  // If authenticated and on login page, redirect to /app
  if (pathname === "/login" && claimsData && !error) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = ""; // Clear any query params like ?next=
    return applyStashedCookies(NextResponse.redirect(url));
  }

  return supabaseResponse;
}
