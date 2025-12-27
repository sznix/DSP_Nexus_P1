import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/constants";

type TenantMemberRow = {
  tenant_id: string;
  role: string;
  tenant: { name: string } | null;
};

export type PageAuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenantId: string;
  role: Role;
  tenantName: string;
};

/**
 * Fetch the current user's tenant membership for server Components.
 * Redirects to /login if unauthenticated, or /app if membership lookup fails.
 */
export async function getTenantMemberOrRedirect(): Promise<PageAuthContext> {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  const { data: memberData, error: memberError } = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenant:tenants(name)")
    .eq("user_id", userId)
    .single();

  if (memberError || !memberData) {
    console.error("[page-auth] Failed to fetch tenant membership", {
      userId,
      error: memberError,
    });
    redirect("/app");
  }

  return {
    supabase,
    userId,
    tenantId: memberData.tenant_id,
    role: memberData.role as Role,
    tenantName: memberData.tenant?.name ?? "Unknown Tenant",
  };
}

/**
 * Require that the current user has one of the allowed roles.
 * Redirects to /app if forbidden.
 */
export async function requirePageRole(
  allowedRoles: readonly Role[]
): Promise<PageAuthContext> {
  const ctx = await getTenantMemberOrRedirect();
  if (!allowedRoles.includes(ctx.role)) {
    redirect("/app");
  }
  return ctx;
}
