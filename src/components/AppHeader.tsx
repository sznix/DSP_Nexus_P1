import Link from "next/link";
import LogoutButton from "@/app/app/logout-button";

type AppHeaderProps = {
  title: string;
  tenantName: string;
  showBackButton?: boolean;
};

export default function AppHeader({
  title,
  tenantName,
  showBackButton = false,
}: AppHeaderProps) {
  return (
    <header className="bg-white/5 backdrop-blur-lg border-b border-white/10 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {showBackButton && (
              <Link
                href="/app"
                className="text-slate-400 hover:text-white transition"
                aria-label="Go back to dashboard"
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
            )}
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <span className="hidden sm:inline-block text-slate-400">|</span>
            <span className="hidden sm:inline-block text-slate-300">
              {tenantName}
            </span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

