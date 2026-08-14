-- The club's best single day ever (any day strictly before p_date, so
-- "today" — still climbing — is never compared against itself). Powers the
-- "new club record" celebration on the Daily Report.
create or replace function club_all_time_high_cups(p_club_id uuid default null, p_date date default current_date)
returns table (record_date date, total_cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select checkin_date, sum(cups) as total_cups
  from checkins
  where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and nc_club_id in (select visible_club_ids(current_coach_id()))
    and not voided
    and checkin_date < p_date
  group by checkin_date
  order by total_cups desc, checkin_date desc
  limit 1;
$$;

-- Same idea as club_all_time_high_cups(), but one coach's own best single
-- day for their personal Coach's Cup — same date-aware exclusion rule as
-- daily_coach_cups(), just evaluated per historical day instead of one.
create or replace function coach_all_time_high_cups(p_coach_id uuid, p_club_id uuid default null, p_date date default current_date)
returns table (record_date date, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  )
  select ci.checkin_date, sum(ci.cups) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where cu.coach_id = p_coach_id
    and ci.nc_club_id = (select id from target_club)
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and not ci.voided
    and ci.checkin_date < p_date
    and not exists (
      select 1 from excl e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
    )
  group by ci.checkin_date
  order by cups desc, ci.checkin_date desc
  limit 1;
$$;

grant execute on function club_all_time_high_cups(uuid, date) to authenticated;
grant execute on function coach_all_time_high_cups(uuid, uuid, date) to authenticated;
