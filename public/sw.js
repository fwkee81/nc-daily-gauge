// Exists solely to satisfy Android Chrome's installability requirement for
// a real "Install" (WebAPK) instead of a plain shortcut — see
// src/instrumentation-client.ts for registration. Deliberately does no
// caching: this app's data (check-ins, balances, finance) must always be
// fresh, so every request just falls through to the network as if there
// were no service worker at all.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle the request normally.
});
