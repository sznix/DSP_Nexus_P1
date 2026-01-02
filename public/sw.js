/**
 * Service Worker for DSP Nexus - Snake Walk offline support.
 *
 * v0: Minimal implementation for offline detection and background sync.
 * Future: Add asset caching for true offline app shell.
 */

const SW_VERSION = "1.0.0";

// Install event - activate immediately
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing v${SW_VERSION}`);
  self.skipWaiting();
});

// Activate event - claim all clients
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating v${SW_VERSION}`);
  event.waitUntil(clients.claim());
});

// Fetch event - pass through for v0 (no caching)
// Future: Cache static assets and app shell
self.addEventListener("fetch", (event) => {
  // For v0, just pass through all requests
  // This allows us to detect offline state via fetch failures
  return;
});

// Background sync event - notify clients to sync
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-mutations") {
    console.log("[SW] Background sync triggered");
    event.waitUntil(notifyClientsToSync());
  }
});

// Message handler for client communication
self.addEventListener("message", (event) => {
  if (event.data?.type === "REGISTER_SYNC") {
    // Client requesting background sync registration
    self.registration.sync.register("sync-mutations").catch((err) => {
      console.warn("[SW] Background sync registration failed:", err);
    });
  }
});

/**
 * Notify all clients to trigger a sync.
 */
async function notifyClientsToSync() {
  const allClients = await clients.matchAll({ type: "window" });
  for (const client of allClients) {
    client.postMessage({ type: "TRIGGER_SYNC" });
  }
}
