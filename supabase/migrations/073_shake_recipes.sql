-- Shake Recipes library: a shared catalog of nutrition shake recipes, each
-- broken into the 5 layers coaches already write on their reference cards
-- (Base / Side / Shake / Body / Topping). Admin-only test rollout for
-- now — gated end to end by is_super_admin() (table RLS + the storage
-- bucket for recipe photos), same account as coaches' super-admin gate.
-- Run this after schema.sql (which already defines is_super_admin()).
--
-- Safe to run more than once (e.g. if a previous run errored partway
-- through) — every statement below is idempotent.

create sequence if not exists shake_recipe_code_seq;

create table if not exists shake_recipes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('S' || lpad(nextval('shake_recipe_code_seq')::text, 3, '0')),
  name_zh text not null,
  name_en text not null,
  base text not null,
  side text not null,
  shake text not null,
  body text not null,
  topping text not null,
  photo_url text,
  created_by uuid references coaches (id),
  created_at timestamptz not null default now()
);

alter table shake_recipes enable row level security;

drop policy if exists "shake_recipes_select_admin" on shake_recipes;
create policy "shake_recipes_select_admin" on shake_recipes
  for select to authenticated using (is_super_admin());
drop policy if exists "shake_recipes_insert_admin" on shake_recipes;
create policy "shake_recipes_insert_admin" on shake_recipes
  for insert to authenticated with check (is_super_admin());
drop policy if exists "shake_recipes_delete_admin" on shake_recipes;
create policy "shake_recipes_delete_admin" on shake_recipes
  for delete to authenticated using (is_super_admin());

-- Storage bucket for recipe photos — public read (so <img src> just works)
-- but writes are locked to the same super admin.
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

drop policy if exists "recipe_photos_select_public" on storage.objects;
create policy "recipe_photos_select_public" on storage.objects
  for select using (bucket_id = 'recipe-photos');
drop policy if exists "recipe_photos_insert_admin" on storage.objects;
create policy "recipe_photos_insert_admin" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-photos' and is_super_admin());
drop policy if exists "recipe_photos_delete_admin" on storage.objects;
create policy "recipe_photos_delete_admin" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-photos' and is_super_admin());
