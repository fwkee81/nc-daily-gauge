-- Per-coach average Coach's Cup over each branch's own last-6-operating-days
-- window — powers the Coach's Cup drill-down under the Branches "Weekly"
-- tab. Same window CTEs as branches_weekly_summary and the same per-coach
-- averaging as weekly_coach_cup_by_coach, just sliced across every visible
-- branch in one call instead of one club at a time.
create or replace function branches_weekly_coach_cups(p_date date default current_date)
returns table (
  club_id uuid,
  coach_id uuid,
  coach_name text,
  total_cups bigint,
  avg_cups_per_day numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  ranked_days as (
    select
      ci.nc_club_id as club_id,
      ci.checkin_date,
      row_number() over (partition by ci.nc_club_id order by ci.checkin_date desc) as rn
    from (
      select distinct nc_club_id, checkin_date
      from checkins
      where not voided and checkin_date <= p_date
    ) ci
    where ci.nc_club_id in (select club_id from my_clubs)
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from ranked_days
    where rn <= 6
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  )
  select
    co.nc_club_id as club_id,
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as total_cups,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif(w.operating_days, 0), 2) as avg_cups_per_day
  from coaches co
  join windows w on w.club_id = co.nc_club_id
  join customers cu on cu.coach_id = co.id
  join checkins ci
    on ci.customer_id = cu.id and ci.nc_club_id = co.nc_club_id and not ci.voided
    and ci.checkin_date between w.window_start and w.window_end
  where co.nc_club_id in (select club_id from my_clubs)
    and not exists (
      select 1 from excluded_per_club ec
      where ec.club_id = co.nc_club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
    )
  group by co.nc_club_id, co.id, co.name, w.operating_days
  having coalesce(sum(ci.cups), 0) > 0
  order by co.nc_club_id, avg_cups_per_day desc;
$$;

grant execute on function branches_weekly_coach_cups(date) to authenticated;
