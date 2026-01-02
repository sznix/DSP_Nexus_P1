"use client";

import { useSyncStatus } from "@/hooks/useSyncStatus";

/**
 * Badge showing current sync status.
 * - Green: Online
 * - Gray: Offline
 * - Yellow: Sync Pending (with count)
 * - Red: Sync Error
 */
export function SyncStatusBadge() {
  const { status, pendingCount, error } = useSyncStatus();

  // Determine badge style and content based on status
  let bgColor: string;
  let textColor: string;
  let label: string;
  let showDot = true;

  switch (status) {
    case "online":
      if (pendingCount > 0) {
        // Pending changes to sync
        bgColor = "bg-yellow-500/20";
        textColor = "text-yellow-300";
        label = `${pendingCount} pending`;
      } else {
        // Fully synced
        bgColor = "bg-green-500/20";
        textColor = "text-green-300";
        label = "Online";
      }
      break;

    case "offline":
      bgColor = "bg-slate-500/20";
      textColor = "text-slate-300";
      label = pendingCount > 0 ? `Offline (${pendingCount})` : "Offline";
      break;

    case "syncing":
      bgColor = "bg-blue-500/20";
      textColor = "text-blue-300";
      label = "Syncing...";
      showDot = false; // Use animation instead
      break;

    case "error":
      bgColor = "bg-red-500/20";
      textColor = "text-red-300";
      label = "Sync Error";
      break;

    default:
      bgColor = "bg-slate-500/20";
      textColor = "text-slate-300";
      label = "Unknown";
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor} border border-current/20`}
      title={error ?? undefined}
    >
      {showDot ? (
        <span
          className={`w-2 h-2 rounded-full ${
            status === "online" && pendingCount === 0
              ? "bg-green-400"
              : status === "online"
              ? "bg-yellow-400"
              : status === "offline"
              ? "bg-slate-400"
              : "bg-red-400"
          }`}
        />
      ) : (
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
      )}
      {label}
    </div>
  );
}
