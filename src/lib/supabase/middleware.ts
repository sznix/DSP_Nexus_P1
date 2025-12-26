import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredEnv } from "@/lib/utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
          cookiesToSetOnResponse = cookiesToSet.map(({ name, value, options }) => ({
            name,
            value,
            options: options as Record<string, unknown>,
          }));

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

  const {
    nextUrl: { pathname },
  } = request;

  // Define public routes that don't require authentication
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".");

  // Helper function to apply stashed cookies to a redirect response
  const applyStashedCookies = (response: NextResponse): NextResponse => {
    cookiesToSetOnResponse.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  // If not authenticated and trying to access protected route, redirect to login
  if (!isPublicRoute && (error || !claimsData)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return applyStashedCookies(NextResponse.redirect(url));
  }

  // If authenticated and on login page, redirect to /app
  if (pathname === "/login" && claimsData && !error) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return applyStashedCookies(NextResponse.redirect(url));
  }

  return supabaseResponse;
}
