import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "../logout-button";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  // Check if user has admin or manager role
  const { data: memberData, error: memberError } = await supabase
    .from("tenant_members")
    .select("role, tenants(name)")
    .eq("user_id", userId)
    .single();

  if (memberError || !memberData) {
    redirect("/app");
  }

  const role = memberData.role as string;
  const tenants = memberData.tenants as unknown as { name: string } | null;
  const tenantName = tenants?.name ?? "Unknown Tenant";

  // Only admin and manager roles can access this page
  if (role !== "admin" && role !== "manager") {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <header className="bg-white/5 backdrop-blur-lg border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/app"
                className="text-slate-400 hover:text-white transition"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <h1 className="text-xl font-bold text-white">Admin Panel</h1>
              <span className="hidden sm:inline-block text-slate-400">|</span>
              <span className="hidden sm:inline-block text-slate-300">
                {tenantName}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <div className="mb-6">
            <svg
              className="w-20 h-20 mx-auto text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
            You&apos;ll be able to manage tenant settings, import data, and configure
            your fleet operations.
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
