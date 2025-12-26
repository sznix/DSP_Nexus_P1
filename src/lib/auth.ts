/**
 * Authentication and authorization utilities for API routes.
 *
 * API routes are excluded from middleware and MUST enforce their own auth.
 * Use these utilities to validate sessions and check roles.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type UserContext = {
  userId: string;
  tenantId: string;
  role: string;
  email?: string;
};

type AuthError = {
  error: string;
  status: 401 | 403;
};

/**
 * Get the current user's context from the session.
 * Returns null if not authenticated.
 */
export async function getUserContext(): Promise<UserContext | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[auth] Missing Supabase environment variables");
    return null;
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // API routes don't need to set cookies
      },
    },
  });

  // Validate session
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    return null;
  }

  const userId = claimsData.claims.sub;

  // Get tenant membership and role
  const { data: memberData, error: memberError } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .single();

  if (memberError || !memberData) {
    return null;
  }

  return {
    userId,
    tenantId: memberData.tenant_id,
    role: memberData.role,
    email: claimsData.claims.email as string | undefined,
  };
}

/**
 * Require authentication for an API route.
 * Returns user context or throws an error response.
 *
 * @example
 * export async function GET(request: Request) {
 *   const user = await requireAuth();
 *   // user is guaranteed to be authenticated
 * }
 */
export async function requireAuth(): Promise<UserContext> {
  const user = await getUserContext();

  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return user;
}

/**
 * Require specific role(s) for an API route.
 * Returns user context or throws an error response (401 or 403).
 *
 * @param allowedRoles - Array of roles that are allowed to access this route
 *
 * @example
 * export async function POST(request: Request) {
 *   const user = await requireRole(["admin", "manager"]);
 *   // user is guaranteed to be admin or manager
 * }
 */
export async function requireRole(
  allowedRoles: string[]
): Promise<UserContext> {
  const user = await getUserContext();

  if (!user) {
    console.warn("[auth] Unauthorized API access attempt");
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!allowedRoles.includes(user.role)) {
    console.warn(
      `[auth] Forbidden: user ${user.userId} with role '${user.role}' attempted to access route requiring ${allowedRoles.join("/")}`
    );
    throw new Response(
      JSON.stringify({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return user;
}

/**
 * Check if user has one of the allowed roles (non-throwing version).
 * Returns the result instead of throwing.
 *
 * @example
 * const result = await checkRole(["admin", "manager"]);
 * if ("error" in result) {
 *   return new Response(JSON.stringify(result), { status: result.status });
 * }
 * const user = result;
 */
export async function checkRole(
  allowedRoles: string[]
): Promise<UserContext | AuthError> {
  const user = await getUserContext();

  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  if (!allowedRoles.includes(user.role)) {
    console.warn(
      `[auth] Forbidden: user ${user.userId} with role '${user.role}' attempted to access route requiring ${allowedRoles.join("/")}`
    );
    return { error: "Forbidden", status: 403 };
  }

  return user;
}
