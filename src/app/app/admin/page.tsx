import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requirePageRole } from "@/lib/page-auth";
import { ADMIN_ALLOWED_ROLES } from "@/lib/constants";

export default async function AdminPage() {
  const { tenantName } = await requirePageRole(ADMIN_ALLOWED_ROLES);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppHeader title="Admin Panel" tenantName={tenantName} showBackButton />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Import Airlock Card */}
          <Link
            href="/app/admin/import-airlock"
            className="group bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 hover:bg-white/10 hover:border-purple-500/50 transition-all"
          >
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition">
                  Import Airlock
                </h3>
                <p className="text-slate-400 text-sm">
                  Upload &amp; publish daily data
                </p>
              </div>
            </div>
            <p className="text-slate-500 text-sm">
              Safely stage, preview, and publish daily assignment data from
              spreadsheets or clipboard.
            </p>
          </Link>

          {/* Team Management Card (Planned) */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 opacity-60">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-slate-500/20 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-slate-300">
                  Team Management
                </h3>
                <p className="text-slate-500 text-sm">Coming Soon</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm">
              Manage team members, roles, and permissions for your organization.
            </p>
          </div>

          {/* Fleet Configuration Card (Planned) */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 opacity-60">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-slate-500/20 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-slate-300">
                  Fleet Configuration
                </h3>
                <p className="text-slate-500 text-sm">Coming Soon</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm">
              Configure vans, zones, parking spots, and other fleet settings.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

