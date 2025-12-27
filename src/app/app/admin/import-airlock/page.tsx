import AppHeader from "@/components/AppHeader";
import ImportAirlockWizard from "./wizard";
import { requirePageRole } from "@/lib/page-auth";
import { ADMIN_ALLOWED_ROLES } from "@/lib/constants";

export default async function ImportAirlockPage() {
  const { tenantName } = await requirePageRole(ADMIN_ALLOWED_ROLES);

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

