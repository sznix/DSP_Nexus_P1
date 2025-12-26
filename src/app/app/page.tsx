import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./logout-button";

type TenantMember = {
  role: "admin" | "manager" | "dispatcher" | "mechanic";
  tenants: {
    id: string;
    name: string;
  } | null;
};

export default async function AppPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  // Query tenant_members for the current user
  const { data: memberData, error: memberError } = await supabase
    .from("tenant_members")
    .select(
      `
      role,
      tenants (
        id,
        name
      )
    `
    )
    .eq("user_id", userId)
    .single<TenantMember>();

  // If user has no tenant_members row
  if (memberError || !memberData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-white/20 max-w-md w-full text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">No Tenant Access</h1>
          <p className="text-slate-300 mb-6">
            Your account is not associated with any tenant. Please contact your
            administrator to get access.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  const { role, tenants } = memberData;
  const tenantName = tenants?.name ?? "Unknown Tenant";

  // Role-based navigation
  const getNavigationLinks = () => {
    switch (role) {
      case "admin":
      case "manager":
        return [
          { href: "/app/admin", label: "Admin Panel", icon: "⚙️" },
          { href: "/app/dispatch", label: "Dispatch View", icon: "📋" },
        ];
      case "dispatcher":
        return [{ href: "/app/dispatch", label: "Dispatch View", icon: "📋" }];
      case "mechanic":
        return [{ href: "/app/mechanic", label: "Mechanic View", icon: "🔧" }];
      default:
        return [];
    }
  };

  const links = getNavigationLinks();

  const getRoleBadgeColor = () => {
    switch (role) {
      case "admin":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "manager":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "dispatcher":
        return "bg-green-500/20 text-green-300 border-green-500/30";
      case "mechanic":
        return "bg-orange-500/20 text-orange-300 border-orange-500/30";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <header className="bg-white/5 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-white">DSP Nexus</h1>
              <span className="hidden sm:inline-block text-slate-400">|</span>
              <span className="hidden sm:inline-block text-slate-300">
                {tenantName}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium border ${getRoleBadgeColor()}`}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to {tenantName}
          </h2>
          <p className="text-slate-400">
            Select an option below to get started
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 hover:bg-white/10 hover:border-white/20 transition duration-200"
            >
              <div className="flex items-center space-x-4">
                <span className="text-4xl">{link.icon}</span>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition">
                    {link.label}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {link.href === "/app/admin" &&
                      "Manage settings and configurations"}
                    {link.href === "/app/dispatch" &&
                      "View today's dispatch assignments"}
                    {link.href === "/app/mechanic" &&
                      "View vehicle maintenance tasks"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Mobile Tenant Info */}
        <div className="mt-8 sm:hidden bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
          <p className="text-slate-400 text-sm">Current Tenant</p>
          <p className="text-white font-medium">{tenantName}</p>
        </div>
      </main>
    </div>
  );
}
