-- Christmas moves from "automatic" (fixed 25 Dec) to "manual" in the code
-- registry (src/lib/holiday-themes.ts) — the admin wants the theme running
-- for several days before Christmas, not just on the day itself, and how
-- many days is their call, adjustable on /admin/holiday-themes without a
-- code change. Default range below is a starting point — change freely.
insert into holiday_themes (slug, start_date, end_date, enabled) values
  ('christmas', '2026-12-20', '2026-12-25', true)
on conflict (slug) do nothing;
