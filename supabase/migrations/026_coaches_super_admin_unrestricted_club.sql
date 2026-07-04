-- Run this in the Supabase SQL editor on your existing project.
--
-- Fixes: super admin (fwkee81@gmail.com) couldn't reassign a coach's
-- Nutrition Club to a club that isn't yet reachable through the sponsor
-- tree (e.g. a club whose Owner hasn't registered yet, or a standalone
-- test/admin account) — got "new row violates row-level security policy
-- for table 'coaches'".
--
-- is_super_admin() is already the only gate that matters here (it's a
-- single hardcoded account, not a per-branch admin role), so the extra
-- "nc_club_id in visible_club_ids(...)" check on this policy was
-- unnecessary and directly blocked that use case. Removing it.

drop policy if exists "coaches_update_admin" on coaches;

create policy "coaches_update_admin" on coaches
  for update to authenticated
  using (is_super_admin())
  with check (is_super_admin());
