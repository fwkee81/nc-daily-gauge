-- Expands holiday theming from 4 to 25 themes. Most of the new ones have a
-- fixed or rule-based date (New Year's Day, Mother's Day, World Heart Day,
-- ...) and are now computed in code (src/lib/holiday-themes.ts) with no
-- database row at all — zero yearly maintenance. That includes Valentine's
-- Day and Christmas, previously rows here; they move out since they were
-- always fixed dates and never actually needed admin editing.
--
-- Only lunar/Hijri/Tamil-calendar holidays, whose real date depends on
-- moon-sighting or an official gazette rather than a formula, still need a
-- row here: Chinese New Year and Deepavali (already seeded by migration
-- 109) plus the five new ones seeded below.
delete from holiday_themes where slug in ('valentines', 'christmas');

insert into holiday_themes (slug, start_date, end_date, enabled) values
  ('hari_raya_aidilfitri', '2026-03-21', '2026-03-22', true),
  ('hari_raya_haji', '2026-05-27', '2026-05-27', true),
  ('wesak_day', '2026-05-31', '2026-05-31', true),
  ('dragon_boat_festival', '2026-06-19', '2026-06-19', true),
  ('mid_autumn_festival', '2026-09-25', '2026-09-25', true),
  ('thaipusam', '2026-02-01', '2026-02-01', true)
on conflict (slug) do nothing;
