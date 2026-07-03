-- Run this in the Supabase SQL editor on your existing project.
--
-- Coaches page changes:
-- 1. Any admin can now VIEW coaches across their whole downline network
--    (own club + sponsored branches), not just their own club.
-- 2. Only fwkee81@gmail.com (the network's founding account) can EDIT or
--    deactivate any coach, anywhere in the network — other branch admins
--    can view but not edit, avoiding cross-club edit disputes.

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select email from auth.users where id = auth.uid()) = 'fwkee81@gmail.com',
    false
  );
$$;

grant execute on function is_super_admin() to authenticated;

drop policy if exists "coaches_update_admin" on coaches;
create policy "coaches_update_admin" on coaches
  for update to authenticated
  using (
    is_super_admin()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  )
  with check (
    is_super_admin()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  );

create or replace function restrict_coach_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_super_admin() then
    return new;
  end if;

  if new.nc_position is distinct from old.nc_position
    or new.level is distinct from old.level
    or new.sponsor_id is distinct from old.sponsor_id
    or new.nc_club_id is distinct from old.nc_club_id
    or new.member_id is distinct from old.member_id
    or new.active is distinct from old.active then
    raise exception 'Only the network admin can change position, level, sponsor, club, member ID, or active status';
  end if;

  return new;
end;
$$;
