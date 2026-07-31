-- NC Metrics Weekly tab needs to show which day(s) each customer came in,
-- not just a total — adds a per-day breakdown (date -> visit count) so the
-- attendance table can render one column per operating day.
create or replace function weekly_customer_attendance(p_date date default current_date, p_club_id uuid default null)
returns table (
  customer_id uuid,
  customer_name text,
  coach_name text,
  nc_level customer_nc_level,
  visit_count bigint,
  daily jsonb
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
    select min(checkin_date) as window_start, max(checkin_date) as window_end
    from ranked_days
    where rn <= 6
  ),
  per_day as (
    select ci.customer_id, ci.checkin_date, count(*) as n
    from checkins ci
    cross join windows w
    where ci.nc_club_id = (select id from target_club)
      and not ci.voided
      and ci.checkin_date between w.window_start and w.window_end
    group by ci.customer_id, ci.checkin_date
  )
  select
    cu.id as customer_id,
    cu.name as customer_name,
    co.name as coach_name,
    cu.nc_level,
    sum(pd.n) as visit_count,
    jsonb_object_agg(pd.checkin_date::text, pd.n) as daily
  from per_day pd
  join customers cu on cu.id = pd.customer_id
  left join coaches co on co.id = cu.coach_id
  group by cu.id, cu.name, co.name, cu.nc_level
  order by visit_count desc, cu.name;
$$;
