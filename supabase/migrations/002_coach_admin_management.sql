-- Run this in the Supabase SQL editor on your existing project to add
-- admin coach management (adds coaches.active, lets an admin edit/deactivate
-- coaches in their own club, and closes a privilege-escalation gap where a
-- non-admin could otherwise edit their own position/level/sponsor/club).

alter table coaches add column if not exists active boolean not null default true;

create policy "coaches_update_admin" on coaches
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create or replace function restrict_coach_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_current_coach_admin() then
    return new;
  end if;

  if new.nc_position is distinct from old.nc_position
    or new.level is distinct from old.level
    or new.sponsor_id is distinct from old.sponsor_id
    or new.nc_club_id is distinct from old.nc_club_id
    or new.member_id is distinct from old.member_id
    or new.active is distinct from old.active then
    raise exception 'Only an admin can change position, level, sponsor, club, member ID, or active status';
  end if;

  return new;
end;
$$;

create trigger coaches_restrict_self_update
before update on coaches
for each row execute function restrict_coach_self_update();
