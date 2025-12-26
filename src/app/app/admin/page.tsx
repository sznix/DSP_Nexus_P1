import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";

// Allowed roles for admin page
const ALLOWED_ROLES = ["admin", "manager"] as const;

type TenantMemberData = {
  role: string;
  tenant: { name: string } | null;
};

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  // Check if user has admin or manager role using alias syntax for proper typing
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

  // Role-based access control: Only admin and manager roles can access this page
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppHeader title="Admin Panel" tenantName={tenantName} showBackButton />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <div className="mb-6">
            <svg
              className="w-20 h-20 mx-auto text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-4">
            Admin Panel Coming Next
          </h2>
          <p className="text-slate-400 max-w-md mx-auto">
            The Import Airlock feature will be available in the next phase.
            You&apos;ll be able to manage tenant settings, import data, and
            configure your fleet operations.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
              <p className="text-slate-400 text-sm">Planned Features</p>
              <p className="text-white font-medium">Import Airlock</p>
            </div>
            <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
              <p className="text-slate-400 text-sm">Planned Features</p>
              <p className="text-white font-medium">Team Management</p>
            </div>
            <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
              <p className="text-slate-400 text-sm">Planned Features</p>
              <p className="text-white font-medium">Fleet Configuration</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
