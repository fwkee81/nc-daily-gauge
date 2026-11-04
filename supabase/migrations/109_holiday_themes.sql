-- Holiday/seasonal theming for the Check-in page. Colors, icon, and greeting
-- copy per theme live in code (src/lib/holiday-themes.ts) since they need a
-- matching icon/palette anyway; only the thing that actually changes every
-- year — the observance dates — lives here, so the super admin can update
-- them each cycle without a code deploy.
create table if not exists holiday_themes (
  id uuid primary key default gen_random_uuid(),
  -- Matches a key in the HOLIDAY_THEMES registry in code.
  slug text not null unique,
  start_date date not null,
  end_date date not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger holiday_themes_set_updated_at
before update on holiday_themes
for each row execute function set_updated_at();

alter table holiday_themes enable row level security;

-- Every coach's check-in page needs to read the active theme, but only the
-- super admin edits dates/enabled — same split as shake_recipes.
drop policy if exists "holiday_themes_select" on holiday_themes;
create policy "holiday_themes_select" on holiday_themes
  for select to authenticated using (true);

drop policy if exists "holiday_themes_insert" on holiday_themes;
create policy "holiday_themes_insert" on holiday_themes
  for insert to authenticated with check (is_super_admin());

drop policy if exists "holiday_themes_update" on holiday_themes;
create policy "holiday_themes_update" on holiday_themes
  for update to authenticated using (is_super_admin()) with check (is_super_admin());

drop policy if exists "holiday_themes_delete" on holiday_themes;
create policy "holiday_themes_delete" on holiday_themes
  for delete to authenticated using (is_super_admin());

grant select, insert, update, delete on holiday_themes to authenticated;

-- Seed the four themes discussed with the user, with real 2026 dates
-- (Chinese New Year and Deepavali are lunar/floating — verified via web
-- search at the time this migration was written, not computed).
insert into holiday_themes (slug, start_date, end_date, enabled) values
  ('chinese_new_year', '2026-02-17', '2026-02-18', true),
  ('valentines', '2026-02-14', '2026-02-14', true),
  ('deepavali', '2026-11-08', '2026-11-08', true),
  ('christmas', '2026-12-25', '2026-12-25', true)
on conflict (slug) do nothing;
