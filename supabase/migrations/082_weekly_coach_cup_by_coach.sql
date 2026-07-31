-- Per-coach breakdown behind weekly_totals' Coach's Cup figure — same
-- window, same coach_cup_excluded_customer_ids eligibility rule, just
-- sliced per coach instead of summed across the whole club. Average is per
-- operating day in the window (not per day the coach personally worked),
-- matching how coach_cup_total / operating_days is presented elsewhere.
create or replace function weekly_coach_cup_by_coach(p_date date default current_date, p_club_id uuid default null)
returns table (
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
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from ranked_days
    where rn <= 6
  ),
  excluded as (
    select customer_id from coach_cup_excluded_customer_ids((select id from target_club))
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as total_cups,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif(w.operating_days, 0), 2) as avg_cups_per_day
  from coaches co
  cross join windows w
  join customers cu on cu.coach_id = co.id
  join checkins ci
    on ci.customer_id = cu.id and ci.nc_club_id = (select id from target_club) and not ci.voided
    and ci.checkin_date between w.window_start and w.window_end
  where co.nc_club_id = (select id from target_club)
    and cu.id not in (select customer_id from excluded)
  group by co.id, co.name, w.operating_days
  having coalesce(sum(ci.cups), 0) > 0
  order by avg_cups_per_day desc;
$$;

grant execute on function weekly_coach_cup_by_coach(date, uuid) to authenticated;
