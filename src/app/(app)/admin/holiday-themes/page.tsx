import { redirect } from "next/navigation";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import { HOLIDAY_THEME_REGISTRY, isHolidayThemeSlug } from "@/lib/holiday-themes";
import { HolidayThemesClient } from "./holiday-themes-client";

export default async function HolidayThemesPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const user = await getCurrentUser();
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
  if (!isSuperAdmin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the super admin can manage holiday themes.
      </div>
    );
  }

  const supabase = await createClient();
  const { data: rows } = await supabase.from("holiday_themes").select("*").order("slug");
  const rowBySlug = new Map((rows ?? []).map((r) => [r.slug, r]));

  // Every registry entry gets a row even if the DB one is somehow missing
  // (e.g. a brand-new theme just added to the registry, before its dates
  // have been set) — the page always shows one card per known theme.
  const themes = Object.keys(HOLIDAY_THEME_REGISTRY)
    .filter(isHolidayThemeSlug)
    .map((slug) => {
      const row = rowBySlug.get(slug);
      return {
        slug,
        name: HOLIDAY_THEME_REGISTRY[slug].name,
        emoji: HOLIDAY_THEME_REGISTRY[slug].emoji,
        startDate: row?.start_date ?? "",
        endDate: row?.end_date ?? "",
        enabled: row?.enabled ?? false,
      };
    });

  return <HolidayThemesClient themes={themes} />;
}
