-- Recipes are now fully admin-curated: every coach can browse the library
-- (still scoped to public + their own club, same visibility as before),
-- but only the super admin may add, edit, or delete a recipe. This
-- retires the earlier "coach adds their own private recipe, then requests
-- to share publicly" flow — every recipe is created directly by the admin
-- now. public_requested is left in place (unused by the app) rather than
-- dropped, in case that flow comes back later.

drop policy if exists "shake_recipes_insert" on shake_recipes;
create policy "shake_recipes_insert" on shake_recipes
  for insert to authenticated
  with check (is_super_admin());

drop policy if exists "shake_recipes_update" on shake_recipes;
create policy "shake_recipes_update" on shake_recipes
  for update to authenticated
  using (is_super_admin())
  with check (is_super_admin());

drop policy if exists "shake_recipes_delete" on shake_recipes;
create policy "shake_recipes_delete" on shake_recipes
  for delete to authenticated
  using (is_super_admin());
