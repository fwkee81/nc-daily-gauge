-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds a per-day snapshot for every sponsored branch, so the /branches page
-- can show each branch's Total Cups, Coach's Cup, New 5-Day, and 10/20/30-Day
-- (new + renewed) numbers at a glance without clicking into each one.

create or replace function branches_daily_summary(p_date date)
returns table (
  club_id uuid,
  club_name text,
  total_cups bigint,
  coach_cup_total bigint,
  new_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with my_branches as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
      and nc.id <> (select nc_club_id from coaches where auth_user_id = auth.uid())
  ),
  excluded_per_club as (
    select mb.club_id, e.customer_id
    from my_branches mb
    cross join lateral coach_cup_excluded_customer_ids(mb.club_id) e
  ),
  cup_totals as (
    select
      mb.club_id,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = mb.club_id and ec.customer_id = cu.id
          )
      ), 0) as coach_cup_total
    from my_branches mb
    join checkins ci on ci.nc_club_id = mb.club_id and ci.checkin_date = p_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by mb.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.nc_level, count(*) as n
    from customers cu
    where cu.nc_club_id in (select club_id from my_branches)
      and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date = p_date
    group by cu.nc_club_id, cu.nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    where cu.nc_club_id in (select club_id from my_branches)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date = p_date
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mb.club_id,
    mb.club_name,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce((select n from new_signups ns where ns.club_id = mb.club_id and ns.nc_level = '5-day'), 0) as new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mb.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mb.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mb.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mb.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mb.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mb.club_id and r.nc_level = '30-day'), 0) as total_30day
  from my_branches mb
  left join cup_totals ct on ct.club_id = mb.club_id
  order by mb.club_name;
$$;

grant execute on function branches_daily_summary(date) to authenticated;
