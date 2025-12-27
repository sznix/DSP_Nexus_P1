"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
      setError("Failed to sign out. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleLogout}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition duration-200 disabled:opacity-50"
        aria-label="Sign out of your account"
      >
        {loading ? "Signing out..." : "Sign Out"}
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-2 w-48 p-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-xs">
          {error}
        </div>
      )}
    </div>
  );
}

