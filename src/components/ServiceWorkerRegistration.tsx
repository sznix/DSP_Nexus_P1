"use client";

import { useEffect } from "react";

/**
 * Component to register the service worker.
 * Rendered once at the root layout level.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[SW] Service worker registered:", registration.scope);

        // Listen for sync trigger messages from SW
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "TRIGGER_SYNC") {
            // Dispatch custom event for SyncProvider to handle
            window.dispatchEvent(new CustomEvent("sync-requested"));
          }
        });
      })
      .catch((error) => {
        console.warn("[SW] Service worker registration failed:", error);
      });

    // Request background sync when going offline then back online
    const handleOnline = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "REGISTER_SYNC",
        });
      }
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // This component doesn't render anything
  return null;
}
