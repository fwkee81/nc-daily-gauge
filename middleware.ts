import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// sw.js/manifest.webmanifest/the icon routes must never redirect to /login —
// a redirected response breaks navigator.serviceWorker.register() outright
// (browsers refuse a non-2xx/redirected service worker script), and PWA
// installability needs the manifest+icons reachable even before sign-in.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icon$|icon-192$|icon-512$|icon-512-maskable$|apple-icon$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
