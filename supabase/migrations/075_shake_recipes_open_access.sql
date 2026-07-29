-- Open Shake Recipes up to every coach, not just the super admin: a recipe
-- is either public (any club can see it) or scoped to the creator's own
-- club, and only the coach who added it (or the super admin) can edit or
-- delete it — so someone else can't accidentally remove another coach's
-- recipe. The /tools/recipes page itself stays admin-only for now (see
-- page.tsx) — these policies are ready for whenever that page-level gate
-- is lifted.

alter table shake_recipes add column if not exists nc_club_id uuid references nc_clubs (id);
alter table shake_recipes add column if not exists is_public boolean not null default true;

drop policy if exists "shake_recipes_select_admin" on shake_recipes;
drop policy if exists "shake_recipes_insert_admin" on shake_recipes;
drop policy if exists "shake_recipes_delete_admin" on shake_recipes;

create policy "shake_recipes_select" on shake_recipes
  for select to authenticated
  using (
    is_public
    or nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    or is_super_admin()
  );

create policy "shake_recipes_insert" on shake_recipes
  for insert to authenticated
  with check (
    nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and created_by = current_coach_id()
  );

create policy "shake_recipes_update" on shake_recipes
  for update to authenticated
  using (created_by = current_coach_id() or is_super_admin())
  with check (created_by = current_coach_id() or is_super_admin());

create policy "shake_recipes_delete" on shake_recipes
  for delete to authenticated
  using (created_by = current_coach_id() or is_super_admin());

-- Photo uploads follow the same "any coach may write, ownership enforced
-- by the shake_recipes row" trust level — the bucket itself has no
-- per-object ownership to check against.
drop policy if exists "recipe_photos_insert_admin" on storage.objects;
drop policy if exists "recipe_photos_delete_admin" on storage.objects;

create policy "recipe_photos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-photos');
create policy "recipe_photos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-photos');
