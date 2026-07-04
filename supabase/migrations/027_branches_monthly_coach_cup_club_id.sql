-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds club_id to branches_monthly_leaderboards()'s output so the client
-- can re-slice the coach_cup_avg rows per club, powering the expandable
-- per-coach breakdown under each club's "Avg Coach's Cup / Day" stat on
-- the Branches "Monthly" tab (matching the same interaction already on
-- the Daily tab).

drop function if exists branches_monthly_leaderboards(date);

create or replace function branches_monthly_leaderboards(p_month date)
returns table (
  board text,
  coach_id uuid,
  coach_name text,
  club_id uuid,
  club_name text,
  value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  new_5day_by_coach as (
    select cu.coach_id, count(*) as n
    from customers cu
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_level = '5-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  new_30_signups as (
    select cu.coach_id, count(*) as n
    from customers cu
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_level = '30-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  renew_30 as (
    select cu.coach_id, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level = '30-day'
      and cr.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  total_30_by_coach as (
    select coach_id, sum(n) as n
    from (
      select coach_id, n from new_30_signups
      union all
      select coach_id, n from renew_30
    ) x
    group by coach_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id
    from my_clubs mc
    cross join lateral coach_cup_excluded_customer_ids(mc.club_id) e
  ),
  club_checkins as (
    select ci.nc_club_id as club_id, ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id in (select club_id from my_clubs)
  ),
  operating_days as (
    select club_id, count(distinct checkin_date) as n
    from club_checkins
    group by club_id
  ),
  coach_cup_by_coach as (
    select cu.coach_id, cc.club_id, coalesce(sum(cc.cups), 0) as total_cups
    from club_checkins cc
    join customers cu on cu.id = cc.customer_id
    where cu.coach_id is not null
      and not exists (
        select 1 from excluded_per_club ec where ec.club_id = cc.club_id and ec.customer_id = cu.id
      )
    group by cu.coach_id, cc.club_id
  ),
  coach_cup_avg_rows as (
    select
      co.id as coach_id,
      co.name as coach_name,
      nc.id as club_id,
      nc.name as club_name,
      round(cb.total_cups::numeric / od.n, 2) as value
    from coach_cup_by_coach cb
    join coaches co on co.id = cb.coach_id
    join nc_clubs nc on nc.id = co.nc_club_id
    join operating_days od on od.club_id = cb.club_id and od.n > 0
  )
  select 'new_5day' as board, co.id as coach_id, co.name as coach_name, nc.id as club_id, nc.name as club_name, n5.n::numeric as value
  from new_5day_by_coach n5
  join coaches co on co.id = n5.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'total_30day', co.id, co.name, nc.id, nc.name, t30.n::numeric
  from total_30_by_coach t30
  join coaches co on co.id = t30.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'coach_cup_avg', coach_id, coach_name, club_id, club_name, value
  from coach_cup_avg_rows
  order by board, value desc;
$$;

grant execute on function branches_monthly_leaderboards(date) to authenticated;
