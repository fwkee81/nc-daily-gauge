// Registers a minimal service worker so the browser considers this app
// installable as a real standalone PWA (Android Chrome otherwise shows
// "This app cannot be installed" and falls back to a plain shortcut that
// still opens with the address bar visible) — see public/sw.js.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have; never block the app on this.
    });
  });
}
