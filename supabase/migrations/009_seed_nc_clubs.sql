-- Run this in the Supabase SQL editor on your existing project.
-- Pre-seeds the fixed set of nutrition clubs coaches can register under.
-- Safe to re-run: does nothing for names that already exist.

insert into nc_clubs (name)
values
  ('Wellness Plus+'),
  ('Wellness Garden'),
  ('Wellness Seed'),
  ('Wellness Talk'),
  ('Wellness Star'),
  ('Wellness Hub')
on conflict (name) do nothing;
