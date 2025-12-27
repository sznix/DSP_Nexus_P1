"use client";

type ErrorDisplayProps = {
  title?: string;
  message?: string;
  errorId?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export default function ErrorDisplay({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again or contact support if the problem persists.",
  errorId,
  onRetry,
  retryLabel = "Try again",
}: ErrorDisplayProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-white/20 max-w-md w-full text-center">
        <div className="mb-6">
          <svg
            className="w-16 h-16 mx-auto text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">{title}</h1>
        <p className="text-slate-300 mb-6">{message}</p>
        {errorId && (
          <p className="text-slate-500 text-sm mb-4">Error ID: {errorId}</p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

