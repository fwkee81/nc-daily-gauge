import type { HolidayTheme } from "@/lib/types/database";

// Visuals (colors, emoji, greeting) live in code since adding a new theme
// always means picking a matching palette anyway — a code change either
// way. Only the dates actually need to change every year, so those alone
// live in the holiday_themes table (see supabase/migrations/109_*.sql),
// editable from /admin/holiday-themes without a deploy.
export const HOLIDAY_THEME_REGISTRY = {
  chinese_new_year: {
    name: "Chinese New Year",
    emoji: "🧧",
    greeting: "Gong Xi Fa Cai — wishing you a prosperous year ahead",
    colors: {
      primary: "#A3111F",
      primaryForeground: "#FFF3E0",
      secondary: "#D4AF37",
      background: "linear-gradient(180deg, #FFF3E6 0%, #FDE7D9 45%, #FBD9C8 100%)",
    },
  },
  valentines: {
    name: "Valentine's Day",
    emoji: "💝",
    greeting: "Happy Valentine's Day — share the love today!",
    colors: {
      primary: "#B8325B",
      primaryForeground: "#FFF3F6",
      secondary: "#F4A6C0",
      background: "linear-gradient(180deg, #FFF3F6 0%, #FDE6ED 45%, #FBDCE6 100%)",
    },
  },
  deepavali: {
    name: "Deepavali",
    emoji: "🪔",
    greeting: "Wishing everyone a bright Deepavali",
    colors: {
      primary: "#7A1F3D",
      primaryForeground: "#FDEEDA",
      secondary: "#C9A227",
      background: "linear-gradient(180deg, #FFF8EA 0%, #FDEEDA 45%, #FBE6D2 100%)",
    },
  },
  christmas: {
    name: "Christmas",
    emoji: "🎄",
    greeting: "Merry Christmas from all of us at the club!",
    colors: {
      primary: "#1B5E3A",
      primaryForeground: "#FFF6EC",
      secondary: "#C9142E",
      background: "linear-gradient(180deg, #F3FAF5 0%, #EAF6EE 45%, #F6EFE9 100%)",
    },
  },
} as const;

export type HolidayThemeSlug = keyof typeof HOLIDAY_THEME_REGISTRY;

export function isHolidayThemeSlug(slug: string): slug is HolidayThemeSlug {
  return slug in HOLIDAY_THEME_REGISTRY;
}

export type ActiveHolidayTheme = (typeof HOLIDAY_THEME_REGISTRY)[HolidayThemeSlug] & {
  slug: HolidayThemeSlug;
};

// today defaults to the server's current date — pass one explicitly in
// tests. Dates are plain "YYYY-MM-DD" strings compared lexically, which
// works fine since they're already zero-padded ISO dates.
export function getActiveHolidayTheme(
  rows: HolidayTheme[],
  today: string = new Date().toISOString().slice(0, 10)
): ActiveHolidayTheme | null {
  const row = rows.find(
    (r) => r.enabled && isHolidayThemeSlug(r.slug) && r.start_date <= today && today <= r.end_date
  );
  if (!row || !isHolidayThemeSlug(row.slug)) return null;
  return { ...HOLIDAY_THEME_REGISTRY[row.slug], slug: row.slug };
}
