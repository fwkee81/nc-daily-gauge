-- Public recipes become admin-curated: once a recipe is public, only the
-- super admin may edit or remove it (the original creator loses write
-- access to it at that point) — everyone else gets view-only. A coach's
-- new recipe always starts scoped to their own club; "Share to Public"
-- just flags it (public_requested) for the admin to approve or reject —
-- it doesn't go public on its own. Only the admin may create a recipe
-- that's public from the start.

alter table shake_recipes add column if not exists public_requested boolean not null default false;

drop policy if exists "shake_recipes_insert" on shake_recipes;
create policy "shake_recipes_insert" on shake_recipes
  for insert to authenticated
  with check (
    created_by = current_coach_id()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and (is_super_admin() or (not is_public and not public_requested))
  );

-- A non-admin may only touch (update/delete) their own recipe while it's
-- still private — once it's public, write access moves to the admin. The
-- WITH CHECK on update additionally stops a non-admin from flipping
-- is_public themselves or reassigning the recipe to another coach/club;
-- "Share to Public" only sets public_requested, which the admin then
-- resolves (see reviewPublicRequest in the app, an admin-only update).
drop policy if exists "shake_recipes_update" on shake_recipes;
create policy "shake_recipes_update" on shake_recipes
  for update to authenticated
  using (
    is_super_admin()
    or (created_by = current_coach_id() and not is_public)
  )
  with check (
    is_super_admin()
    or (
      created_by = current_coach_id()
      and not is_public
      and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  );

drop policy if exists "shake_recipes_delete" on shake_recipes;
create policy "shake_recipes_delete" on shake_recipes
  for delete to authenticated
  using (
    is_super_admin()
    or (created_by = current_coach_id() and not is_public)
  );
