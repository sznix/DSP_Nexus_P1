import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "../logout-button";

type DailyAssignment = {
  id: string;
  pad: string | null;
  dispatch_time: string | null;
  cart_location: string | null;
  key_status: string | null;
  verification_status: string | null;
  vans: {
    label: string;
  } | null;
  drivers: {
    first_name: string;
    last_name: string;
  } | null;
  lot_spots: {
    label: string;
    sort_index: number;
    lot_zones: {
      name: string;
      sort_order: number;
    } | null;
  } | null;
};

export default async function DispatchPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  // Get tenant_id from tenant_members
  const { data: memberData, error: memberError } = await supabase
    .from("tenant_members")
    .select("tenant_id, tenants(name)")
    .eq("user_id", userId)
    .single();

  if (memberError || !memberData) {
    redirect("/app");
  }

  const tenantId = memberData.tenant_id;
  const tenants = memberData.tenants as unknown as { name: string } | null;
  const tenantName = tenants?.name ?? "Unknown Tenant";

  // Get today's date in YYYY-MM-DD format (server date)
  const today = new Date().toISOString().split("T")[0];

  // Query daily_assignments for today, ordered by zone.sort_order and spot.sort_index
  const { data: assignments, error: assignmentsError } = await supabase
    .from("daily_assignments")
    .select(
      `
      id,
      pad,
      dispatch_time,
      cart_location,
      key_status,
      verification_status,
      vans (
        label
      ),
      drivers (
        first_name,
        last_name
      ),
      lot_spots (
        label,
        sort_index,
        lot_zones (
          name,
          sort_order
        )
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("day_date", today)
    .returns<DailyAssignment[]>();

  // Sort the assignments by zone.sort_order asc, then spot.sort_index asc
  const sortedAssignments = (assignments ?? []).sort((a, b) => {
    const aZoneOrder = a.lot_spots?.lot_zones?.sort_order ?? 999;
    const bZoneOrder = b.lot_spots?.lot_zones?.sort_order ?? 999;

    if (aZoneOrder !== bZoneOrder) {
      return aZoneOrder - bZoneOrder;
    }

    const aSpotIndex = a.lot_spots?.sort_index ?? 999;
    const bSpotIndex = b.lot_spots?.sort_index ?? 999;

    return aSpotIndex - bSpotIndex;
  });

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;

    const statusColors: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
      verified: "bg-green-500/20 text-green-300 border-green-500/30",
      completed: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      issue: "bg-red-500/20 text-red-300 border-red-500/30",
    };

    return (
      <span
        className={`px-2 py-1 text-xs rounded-full border ${
          statusColors[status.toLowerCase()] ??
          "bg-slate-500/20 text-slate-300 border-slate-500/30"
        }`}
      >
        {status}
      </span>
    );
  };

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
              <h1 className="text-xl font-bold text-white">Snake Walk</h1>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">
            Today&apos;s Dispatch
          </h2>
          <p className="text-slate-400">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {assignmentsError ? (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-red-200">
            <p>Error loading assignments: {assignmentsError.message}</p>
          </div>
        ) : sortedAssignments.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-8 text-center">
            <svg
              className="w-16 h-16 mx-auto text-slate-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <h3 className="text-xl font-semibold text-white mb-2">
              No Assignments Today
            </h3>
            <p className="text-slate-400">
              There are no dispatch assignments for today.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Zone
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Spot
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Van
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Driver
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Pad
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Dispatch
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Cart
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Key
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sortedAssignments.map((assignment, index) => (
                      <tr
                        key={assignment.id}
                        className={`${
                          index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                        } hover:bg-white/5 transition`}
                      >
                        <td className="px-4 py-3 text-sm text-white font-medium">
                          {assignment.lot_spots?.lot_zones?.name ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {assignment.lot_spots?.label ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-white font-medium">
                          {assignment.vans?.label ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {assignment.drivers
                            ? `${assignment.drivers.first_name} ${assignment.drivers.last_name}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {assignment.pad ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {assignment.dispatch_time ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {assignment.cart_location ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {assignment.key_status ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {getStatusBadge(assignment.verification_status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {sortedAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg font-bold text-white">
                        {assignment.vans?.label ?? "No Van"}
                      </span>
                      {getStatusBadge(assignment.verification_status)}
                    </div>
                    <span className="text-sm text-slate-400">
                      {assignment.lot_spots?.lot_zones?.name ?? "-"} /{" "}
                      {assignment.lot_spots?.label ?? "-"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400 block">Driver</span>
                      <span className="text-white">
                        {assignment.drivers
                          ? `${assignment.drivers.first_name} ${assignment.drivers.last_name}`
                          : "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Pad</span>
                      <span className="text-white">
                        {assignment.pad ?? "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Dispatch</span>
                      <span className="text-white">
                        {assignment.dispatch_time ?? "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Cart</span>
                      <span className="text-white">
                        {assignment.cart_location ?? "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Key Status</span>
                      <span className="text-white">
                        {assignment.key_status ?? "-"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-sm text-slate-400">
              Total assignments: {sortedAssignments.length}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
