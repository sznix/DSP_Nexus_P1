import AppHeader from "@/components/AppHeader";
import { requirePageRole } from "@/lib/page-auth";
import { MECHANIC_ALLOWED_ROLES } from "@/lib/constants";

export default async function MechanicPage() {
  const { tenantName } = await requirePageRole(MECHANIC_ALLOWED_ROLES);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppHeader title="Mechanic View" tenantName={tenantName} showBackButton />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <div className="mb-6">
            <svg
              className="w-20 h-20 mx-auto text-orange-400"
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
            Mechanic View Coming Next
          </h2>
          <p className="text-slate-400 max-w-md mx-auto">
            The mechanic dashboard will be available in an upcoming phase.
            You&apos;ll be able to view vehicle maintenance tasks, report
            issues, and track repairs.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
              <p className="text-slate-400 text-sm">Planned Features</p>
              <p className="text-white font-medium">Maintenance Tasks</p>
            </div>
            <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
              <p className="text-slate-400 text-sm">Planned Features</p>
              <p className="text-white font-medium">Issue Reporting</p>
            </div>
            <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
              <p className="text-slate-400 text-sm">Planned Features</p>
              <p className="text-white font-medium">Vehicle History</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

