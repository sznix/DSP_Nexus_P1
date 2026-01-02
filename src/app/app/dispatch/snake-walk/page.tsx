import { requirePageRole } from "@/lib/page-auth";
import { DISPATCH_ALLOWED_ROLES } from "@/lib/constants";
import { SyncProvider } from "@/components/SyncProvider";
import { SnakeWalkClient } from "./client";

export const dynamic = "force-dynamic";

/**
 * Snake Walk page - Server component for auth, delegates to client for data.
 *
 * This hybrid approach:
 * - Server: Authenticates user, gets tenant context
 * - Client: Uses RxDB for offline-first data access
 */
export default async function SnakeWalkPage() {
  const { tenantId, tenantName } = await requirePageRole(DISPATCH_ALLOWED_ROLES);

  return (
    <SyncProvider tenantId={tenantId}>
      <SnakeWalkClient tenantName={tenantName} />
    </SyncProvider>
  );
}
