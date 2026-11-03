import { redirect } from "next/navigation";
import Link from "next/link";
import { Minimize2 } from "lucide-react";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolidayTheme } from "@/lib/holiday-themes";

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

  const supabase = await createClient();
  const { data: holidayThemes } = await supabase.from("holiday_themes").select("*");
  const theme = getActiveHolidayTheme(holidayThemes ?? []);

  return (
    <div
      className="min-h-screen"
      style={
        theme
          ? ({
              background: theme.colors.background,
              "--primary": theme.colors.primary,
              "--primary-foreground": theme.colors.primaryForeground,
              "--secondary": theme.colors.secondary,
            } as React.CSSProperties)
          : undefined
      }
    >
      <Link
        href="/dashboard"
        aria-label="Exit full screen"
        title="Exit full screen"
        className="fixed top-3 right-3 z-50 flex size-10 items-center justify-center rounded-full border bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        style={theme ? { color: theme.colors.primary } : undefined}
      >
        <Minimize2 className="size-5" />
      </Link>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {theme && (
          <p className="mb-3 text-center text-sm font-medium" style={{ color: theme.colors.primary }}>
            <span aria-hidden>{theme.emoji}</span> {theme.greeting}
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
