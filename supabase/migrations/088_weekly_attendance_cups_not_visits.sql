-- Every customer who checked in during the same 6-operating-day window,
-- with how many CUPS (not check-in events) each day — powers the Weekly
-- tab's attendance list so a coach meeting can spot who's coming in often
-- vs. barely showing up. Was previously counting check-in rows (count(*)),
-- which happened to equal cups for a 1-cup-per-visit customer but silently
-- undercounted anyone who checks in once for 2 cups — sum(ci.cups) instead.
-- Renaming visit_count to total_cups to match what it now holds is itself
-- a return-column change, which CREATE OR REPLACE can't do — drop first.
drop function if exists weekly_customer_attendance(date, uuid);

create or replace function weekly_customer_attendance(p_date date default current_date, p_club_id uuid default null)
returns table (
  customer_id uuid,
  customer_name text,
  coach_name text,
  nc_level customer_nc_level,
  total_cups bigint,
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
    select ci.customer_id, ci.checkin_date, sum(ci.cups) as n
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
    sum(pd.n) as total_cups,
    jsonb_object_agg(pd.checkin_date::text, pd.n) as daily
  from per_day pd
  join customers cu on cu.id = pd.customer_id
  left join coaches co on co.id = cu.coach_id
  group by cu.id, cu.name, co.name, cu.nc_level
  order by total_cups desc, cu.name;
$$;

grant execute on function weekly_customer_attendance(date, uuid) to authenticated;
