import { redirect } from "next/navigation";
import Link from "next/link";
import { Minimize2 } from "lucide-react";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";

// Deliberately NOT nested under (app)/layout.tsx — Check-in is the one
// screen a customer actually looks at while a coach uses it, so it gets no
// shared header/nav at all, just this one small way back to the rest of
// the app. Same auth guards as (app)/layout.tsx, duplicated rather than
// shared, since this route needs a different shell, not a different check.
export default async function CheckinLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const coach = await getCurrentCoach();
  if (!coach) {
    redirect("/onboarding");
  }
  if (!coach.approved || !coach.active) {
    redirect("/pending-approval");
  }

  return (
    <div className="min-h-screen">
      <Link
        href="/dashboard"
        aria-label="Exit full screen"
        title="Exit full screen"
        className="fixed top-3 right-3 z-50 flex size-10 items-center justify-center rounded-full border bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
      >
        <Minimize2 className="size-5" />
      </Link>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
