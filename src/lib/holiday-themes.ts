import type { HolidayTheme } from "@/lib/types/database";

// Two kinds of theme:
// - "fixed"/"nth-weekday": the date can be computed by a rule (same calendar
//   date every year, or e.g. "2nd Sunday of May") — these need zero yearly
//   maintenance, no database row at all.
// - "manual": a lunar/Hijri/Tamil-calendar holiday (Chinese New Year, Hari
//   Raya, Deepavali, ...) whose real-world date depends on moon-sighting or
//   an official gazette, not a formula — there is no reliable way to compute
//   these, so their date lives in the holiday_themes table, admin-edited
//   once a year (see /admin/holiday-themes and the annual reminder).
export type HolidayRule =
  | { kind: "fixed"; month: number; day: number }
  | { kind: "nth-weekday"; month: number; weekday: number; n: number }
  | { kind: "manual" };

interface HolidayThemeDef {
  name: string;
  emoji: string;
  greeting: string;
  colors: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    background: string;
  };
  rule: HolidayRule;
}

// Visuals (colors, emoji, greeting) always live in code — adding a theme
// always means picking a matching palette anyway, a code change either way.
export const HOLIDAY_THEME_REGISTRY = {
  // --- Automatic (fixed or rule-based date), roughly in calendar order ---
  new_year: {
    name: "New Year's Day",
    emoji: "🎉",
    greeting: "Happy New Year — here's to a healthier year ahead!",
    colors: { primary: "#1E40AF", primaryForeground: "#FFFFFF", secondary: "#D4AF37", background: "linear-gradient(180deg, #EEF4FF 0%, #E3EEFF 45%, #FDF6E3 100%)" },
    rule: { kind: "fixed", month: 1, day: 1 },
  },
  world_cancer_day: {
    name: "World Cancer Day",
    emoji: "🎗️",
    greeting: "World Cancer Day — early screening saves lives",
    colors: { primary: "#6B3FA0", primaryForeground: "#FFFFFF", secondary: "#C9A7E0", background: "linear-gradient(180deg, #F6F0FB 0%, #EFE4F7 45%, #F3ECF9 100%)" },
    rule: { kind: "fixed", month: 2, day: 4 },
  },
  valentines: {
    name: "Valentine's Day",
    emoji: "💝",
    greeting: "Happy Valentine's Day — share the love today!",
    colors: { primary: "#B8325B", primaryForeground: "#FFF3F6", secondary: "#F4A6C0", background: "linear-gradient(180deg, #FFF3F6 0%, #FDE6ED 45%, #FBDCE6 100%)" },
    rule: { kind: "fixed", month: 2, day: 14 },
  },
  world_obesity_day: {
    name: "World Obesity Day",
    emoji: "⚖️",
    greeting: "World Obesity Day — small steps, real change",
    colors: { primary: "#0F766E", primaryForeground: "#FFFFFF", secondary: "#99E6DD", background: "linear-gradient(180deg, #EAFBF8 0%, #DFF6F2 45%, #F0FAE8 100%)" },
    rule: { kind: "fixed", month: 3, day: 4 },
  },
  womens_day: {
    name: "International Women's Day",
    emoji: "👩",
    greeting: "Happy International Women's Day!",
    colors: { primary: "#9D174D", primaryForeground: "#FFFFFF", secondary: "#F3A6C8", background: "linear-gradient(180deg, #FDF0F6 0%, #FBE5EF 45%, #FDF1E7 100%)" },
    rule: { kind: "fixed", month: 3, day: 8 },
  },
  world_health_day: {
    name: "World Health Day",
    emoji: "🩺",
    greeting: "World Health Day — your health, your priority",
    colors: { primary: "#0369A1", primaryForeground: "#FFFFFF", secondary: "#A7D8F0", background: "linear-gradient(180deg, #EAF6FD 0%, #DEF0FB 45%, #F2FAFD 100%)" },
    rule: { kind: "fixed", month: 4, day: 7 },
  },
  labour_day: {
    name: "Labour Day",
    emoji: "🛠️",
    greeting: "Happy Labour Day — rest well, you've earned it",
    colors: { primary: "#B91C1C", primaryForeground: "#FFFFFF", secondary: "#F59E0B", background: "linear-gradient(180deg, #FFF4ED 0%, #FDE8DC 45%, #FEF3E2 100%)" },
    rule: { kind: "fixed", month: 5, day: 1 },
  },
  no_diet_day: {
    name: "International No Diet Day",
    emoji: "🥗",
    greeting: "Every body is a good body",
    colors: { primary: "#15803D", primaryForeground: "#FFFFFF", secondary: "#FACC15", background: "linear-gradient(180deg, #F2FBEE 0%, #E7F7DF 45%, #FBF8E2 100%)" },
    rule: { kind: "fixed", month: 5, day: 6 },
  },
  mothers_day: {
    name: "Mother's Day",
    emoji: "💐",
    greeting: "Happy Mother's Day to all the amazing mums!",
    colors: { primary: "#BE185D", primaryForeground: "#FFFFFF", secondary: "#FBCFE8", background: "linear-gradient(180deg, #FEF1F6 0%, #FCE4EF 45%, #FDF4E9 100%)" },
    rule: { kind: "nth-weekday", month: 5, weekday: 0, n: 2 },
  },
  fathers_day: {
    name: "Father's Day",
    emoji: "🎩",
    greeting: "Happy Father's Day!",
    colors: { primary: "#1E3A5F", primaryForeground: "#FFFFFF", secondary: "#9CA8B8", background: "linear-gradient(180deg, #EEF2F7 0%, #E2E9F1 45%, #F3F0E8 100%)" },
    rule: { kind: "nth-weekday", month: 6, weekday: 0, n: 3 },
  },
  merdeka_day: {
    name: "Merdeka Day",
    emoji: "🇲🇾",
    greeting: "Happy Merdeka Day — Malaysia Boleh!",
    colors: { primary: "#00205B", primaryForeground: "#FFFFFF", secondary: "#CC0001", background: "linear-gradient(180deg, #EEF2FB 0%, #FDEBEB 45%, #FEF9E7 100%)" },
    rule: { kind: "fixed", month: 8, day: 31 },
  },
  malaysia_day: {
    name: "Malaysia Day",
    emoji: "🇲🇾",
    greeting: "Happy Malaysia Day!",
    colors: { primary: "#CC0001", primaryForeground: "#FFFFFF", secondary: "#00205B", background: "linear-gradient(180deg, #FDEBEB 0%, #EEF2FB 45%, #FEF9E7 100%)" },
    rule: { kind: "fixed", month: 9, day: 16 },
  },
  world_heart_day: {
    name: "World Heart Day",
    emoji: "❤️",
    greeting: "World Heart Day — look after your heart",
    colors: { primary: "#B91C1C", primaryForeground: "#FFFFFF", secondary: "#FCA5A5", background: "linear-gradient(180deg, #FEF1F1 0%, #FCE4E4 45%, #FDF3EC 100%)" },
    rule: { kind: "fixed", month: 9, day: 29 },
  },
  world_mental_health_day: {
    name: "World Mental Health Day",
    emoji: "🧠",
    greeting: "World Mental Health Day — it's okay to not be okay",
    colors: { primary: "#047857", primaryForeground: "#FFFFFF", secondary: "#A7D8C9", background: "linear-gradient(180deg, #ECFAF4 0%, #DFF5EB 45%, #F3F9EA 100%)" },
    rule: { kind: "fixed", month: 10, day: 10 },
  },
  world_diabetes_day: {
    name: "World Diabetes Day",
    emoji: "🔵",
    greeting: "World Diabetes Day",
    colors: { primary: "#1D4ED8", primaryForeground: "#FFFFFF", secondary: "#93C5FD", background: "linear-gradient(180deg, #EDF2FE 0%, #E1E9FD 45%, #EFF6FE 100%)" },
    rule: { kind: "fixed", month: 11, day: 14 },
  },
  christmas: {
    name: "Christmas",
    emoji: "🎄",
    greeting: "Merry Christmas from all of us at the club!",
    colors: { primary: "#1B5E3A", primaryForeground: "#FFF6EC", secondary: "#C9142E", background: "linear-gradient(180deg, #F3FAF5 0%, #EAF6EE 45%, #F6EFE9 100%)" },
    rule: { kind: "fixed", month: 12, day: 25 },
  },
  boxing_day: {
    name: "Boxing Day",
    emoji: "🎁",
    greeting: "Happy Boxing Day!",
    colors: { primary: "#7F1D1D", primaryForeground: "#FFFFFF", secondary: "#D4AF37", background: "linear-gradient(180deg, #FBF0EC 0%, #F6E4DD 45%, #FCF3E3 100%)" },
    rule: { kind: "fixed", month: 12, day: 26 },
  },

  // --- Manual (date set each year on /admin/holiday-themes) ---
  chinese_new_year: {
    name: "Chinese New Year",
    emoji: "🧧",
    greeting: "Gong Xi Fa Cai — wishing you a prosperous year ahead",
    colors: { primary: "#A3111F", primaryForeground: "#FFF3E0", secondary: "#D4AF37", background: "linear-gradient(180deg, #FFF3E6 0%, #FDE7D9 45%, #FBD9C8 100%)" },
    rule: { kind: "manual" },
  },
  hari_raya_aidilfitri: {
    name: "Hari Raya Aidilfitri",
    emoji: "🌙",
    greeting: "Selamat Hari Raya Aidilfitri — Maaf Zahir dan Batin",
    colors: { primary: "#0D6E4F", primaryForeground: "#FFFFFF", secondary: "#D4AF37", background: "linear-gradient(180deg, #F0FAF3 0%, #E2F4E9 45%, #FBF6E3 100%)" },
    rule: { kind: "manual" },
  },
  hari_raya_haji: {
    name: "Hari Raya Haji",
    emoji: "🐑",
    greeting: "Selamat Hari Raya Haji",
    colors: { primary: "#0E7490", primaryForeground: "#FFFFFF", secondary: "#D4AF37", background: "linear-gradient(180deg, #EAF7F9 0%, #DCF0F3 45%, #FBF6E3 100%)" },
    rule: { kind: "manual" },
  },
  wesak_day: {
    name: "Wesak Day",
    emoji: "🪷",
    greeting: "Happy Wesak Day — may you find peace",
    colors: { primary: "#B8860B", primaryForeground: "#FFFFFF", secondary: "#F5DEB3", background: "linear-gradient(180deg, #FFF9EC 0%, #FDF1D8 45%, #FEF6E6 100%)" },
    rule: { kind: "manual" },
  },
  deepavali: {
    name: "Deepavali",
    emoji: "🪔",
    greeting: "Wishing everyone a bright Deepavali",
    colors: { primary: "#7A1F3D", primaryForeground: "#FDEEDA", secondary: "#C9A227", background: "linear-gradient(180deg, #FFF8EA 0%, #FDEEDA 45%, #FBE6D2 100%)" },
    rule: { kind: "manual" },
  },
  dragon_boat_festival: {
    name: "Dragon Boat Festival",
    emoji: "🐉",
    greeting: "Happy Dragon Boat Festival!",
    colors: { primary: "#15803D", primaryForeground: "#FFFFFF", secondary: "#C9142E", background: "linear-gradient(180deg, #EFFAF1 0%, #E2F4E5 45%, #FDEDED 100%)" },
    rule: { kind: "manual" },
  },
  mid_autumn_festival: {
    name: "Mid-Autumn Festival",
    emoji: "🥮",
    greeting: "Happy Mid-Autumn Festival!",
    colors: { primary: "#92400E", primaryForeground: "#FFFFFF", secondary: "#D4AF37", background: "linear-gradient(180deg, #FFF8E8 0%, #FDEFD2 45%, #FBE3C4 100%)" },
    rule: { kind: "manual" },
  },
  thaipusam: {
    name: "Thaipusam",
    emoji: "🙏",
    greeting: "Happy Thaipusam",
    colors: { primary: "#C2410C", primaryForeground: "#FFFFFF", secondary: "#FACC15", background: "linear-gradient(180deg, #FFF4E8 0%, #FDE8D0 45%, #FEF6D8 100%)" },
    rule: { kind: "manual" },
  },
} satisfies Record<string, HolidayThemeDef>;

export type HolidayThemeSlug = keyof typeof HOLIDAY_THEME_REGISTRY;

export function isHolidayThemeSlug(slug: string): slug is HolidayThemeSlug {
  return slug in HOLIDAY_THEME_REGISTRY;
}

export type ActiveHolidayTheme = HolidayThemeDef & { slug: HolidayThemeSlug };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// nth occurrence of a weekday in a given month/year, e.g. "2nd Sunday of
// May" — weekday follows JS Date convention (0 = Sunday .. 6 = Saturday).
function nthWeekdayDate(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// The date this rule falls on in a given year — null for "manual" rules,
// whose date isn't computable (see the comment on HolidayRule above).
function dateForRule(rule: HolidayRule, year: number): string | null {
  if (rule.kind === "fixed") return `${year}-${pad(rule.month)}-${pad(rule.day)}`;
  if (rule.kind === "nth-weekday") return nthWeekdayDate(year, rule.month, rule.weekday, rule.n);
  return null;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

// Human-readable description of a rule, for the admin page (so it's clear
// why a theme has no date fields to edit).
export function describeHolidayRule(rule: HolidayRule): string {
  if (rule.kind === "fixed") return `${rule.day} ${MONTH_NAMES[rule.month - 1]} every year`;
  if (rule.kind === "nth-weekday") {
    return `${ORDINALS[rule.n - 1]} ${WEEKDAY_NAMES[rule.weekday]} of ${MONTH_NAMES[rule.month - 1]} every year`;
  }
  return "Date set manually below";
}

// today defaults to the server's current date — pass one explicitly in
// tests. Dates are plain "YYYY-MM-DD" strings compared lexically, which
// works fine since they're already zero-padded ISO dates.
export function getActiveHolidayTheme(
  rows: HolidayTheme[],
  today: string = new Date().toISOString().slice(0, 10)
): ActiveHolidayTheme | null {
  const year = Number(today.slice(0, 4));
  const manualRowBySlug = new Map(rows.map((r) => [r.slug, r]));

  for (const slug of Object.keys(HOLIDAY_THEME_REGISTRY) as HolidayThemeSlug[]) {
    const theme = HOLIDAY_THEME_REGISTRY[slug];
    if (theme.rule.kind === "manual") {
      const row = manualRowBySlug.get(slug);
      if (row && row.enabled && row.start_date <= today && today <= row.end_date) {
        return { ...theme, slug };
      }
    } else if (dateForRule(theme.rule, year) === today) {
      return { ...theme, slug };
    }
  }
  return null;
}
