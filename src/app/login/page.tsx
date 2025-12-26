"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Error messages for callback errors and API responses
const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_error: "Authentication failed. Please try signing in again.",
  session_expired: "Your session has expired. Please sign in again.",
  rate_limited: "Too many requests. Please wait a few minutes before trying again.",
};

function getInitialMessage(
  errorParam: string | null
): { type: "success" | "error"; text: string } | null {
  if (!errorParam) return null;
  return {
    type: "error",
    text: ERROR_MESSAGES[errorParam] ?? "An authentication error occurred.",
  };
}

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const nextParam = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(() => getInitialMessage(errorParam));

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Sanitize email: trim whitespace and lowercase
    const sanitizedEmail = email.trim().toLowerCase();

    if (!sanitizedEmail) {
      setMessage({ type: "error", text: "Please enter a valid email address." });
      setLoading(false);
      return;
    }

    try {
      // Use server-side API route for rate limiting
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: sanitizedEmail,
          redirectTo: nextParam || "/app",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle rate limiting specifically
        if (response.status === 429) {
          const retryAfter = data.retryAfter || 60;
          const minutes = Math.ceil(retryAfter / 60);
          setMessage({
            type: "error",
            text: `Too many requests. Please wait ${minutes} minute${minutes > 1 ? "s" : ""} before trying again.`,
          });
        } else {
          setMessage({
            type: "error",
            text: data.error || "Failed to send magic link. Please try again.",
          });
        }
      } else {
        setMessage({
          type: "success",
          text: data.message || "Check your email for the magic link!",
        });
        setEmail("");
      }
    } catch (err) {
      console.error("Login error:", err);
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      });
    }

    setLoading(false);
  };

  return (
    <>
      <form onSubmit={handleLogin} className="space-y-6">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-200 mb-2"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center"
        >
          {loading ? (
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            "Send Magic Link"
          )}
        </button>
      </form>

      {message && (
        <div
          role="alert"
          className={`mt-6 p-4 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-500/20 text-green-200 border border-green-500/30"
              : "bg-red-500/20 text-red-200 border border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}
    </>
  );
}

function LoginFormFallback() {
  return (
    <div className="space-y-6">
      <div>
        <div className="block text-sm font-medium text-slate-200 mb-2">
          Email Address
        </div>
        <div className="w-full h-12 bg-white/5 border border-white/10 rounded-lg animate-pulse" />
      </div>
      <div className="w-full h-12 bg-blue-600/50 rounded-lg animate-pulse" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">DSP Nexus</h1>
            <p className="text-slate-300">Fleet Intelligence Platform</p>
          </div>

          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-slate-400 text-sm mt-6">
          Sign in with a magic link sent to your email
        </p>
      </div>
    </div>
  );
}
