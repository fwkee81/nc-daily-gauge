-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds the data behind the Branches page's new "Monthly" tab:
-- 1. branches_monthly_summary() — per-club (own club first, then branches)
--    this month's average cups/day, average Coach's Cup/day, and totals
--    for 5/10/20/30-day.
-- 2. branches_monthly_leaderboards() — cross-club rankings: most new 5-day
--    trial sign-ups, most 30-day activity (new + renewed), and highest
--    average Coach's Cup per operating day, one row per board tagged by
--    the `board` column.

create or replace function branches_monthly_summary(p_month date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  avg_daily_cups numeric,
  coach_cup_avg_daily numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint
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
  excluded_per_club as (
    select mc.club_id, e.customer_id
    from my_clubs mc
    cross join lateral coach_cup_excluded_customer_ids(mc.club_id) e
  ),
  cup_totals as (
    select
      cc.club_id,
      coalesce(sum(cc.cups), 0) as total_cups,
      coalesce(sum(cc.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec where ec.club_id = cc.club_id and ec.customer_id = cu.id
          )
      ), 0) as coach_cup_total
    from club_checkins cc
    join customers cu on cu.id = cc.customer_id
    group by cc.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.nc_level, count(*) as n
    from customers cu
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between b.month_start and b.month_end
    group by cu.nc_club_id, cu.nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between b.month_start and b.month_end
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(od.n, 0) as operating_days,
    round(coalesce(ct.total_cups, 0)::numeric / nullif(od.n, 0), 2) as avg_daily_cups,
    round(coalesce(ct.coach_cup_total, 0)::numeric / nullif(od.n, 0), 2) as coach_cup_avg_daily,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day
  from my_clubs mc
  left join operating_days od on od.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  order by (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())), mc.club_name;
$$;

grant execute on function branches_monthly_summary(date) to authenticated;

create or replace function branches_monthly_leaderboards(p_month date)
returns table (
  board text,
  coach_id uuid,
  coach_name text,
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
      nc.name as club_name,
      round(cb.total_cups::numeric / od.n, 2) as value
    from coach_cup_by_coach cb
    join coaches co on co.id = cb.coach_id
    join nc_clubs nc on nc.id = co.nc_club_id
    join operating_days od on od.club_id = cb.club_id and od.n > 0
  )
  select 'new_5day' as board, co.id as coach_id, co.name as coach_name, nc.name as club_name, n5.n::numeric as value
  from new_5day_by_coach n5
  join coaches co on co.id = n5.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'total_30day', co.id, co.name, nc.name, t30.n::numeric
  from total_30_by_coach t30
  join coaches co on co.id = t30.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'coach_cup_avg', coach_id, coach_name, club_name, value
  from coach_cup_avg_rows
  order by board, value desc;
$$;

grant execute on function branches_monthly_leaderboards(date) to authenticated;
