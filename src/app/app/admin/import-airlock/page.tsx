import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ImportAirlockWizard from "./wizard";

// Allowed roles for import airlock
const ALLOWED_ROLES = ["admin", "manager"] as const;

type TenantMemberData = {
  role: string;
  tenant: { name: string } | null;
};

export default async function ImportAirlockPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  // Check if user has admin or manager role
  const { data: memberData, error: memberError } = await supabase
    .from("tenant_members")
    .select("role, tenant:tenants(name)")
    .eq("user_id", userId)
    .single<TenantMemberData>();

  if (memberError || !memberData) {
    redirect("/app");
  }

  const role = memberData.role;
  const tenantName = memberData.tenant?.name ?? "Unknown Tenant";

  // Role-based access control
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppHeader
        title="Import Airlock"
        tenantName={tenantName}
        showBackButton
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ImportAirlockWizard />
      </main>
    </div>
  );
}
