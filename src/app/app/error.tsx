"use client";

import { useEffect } from "react";
import ErrorDisplay from "@/components/ErrorDisplay";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return <ErrorDisplay errorId={error.digest} onRetry={reset} />;
}
