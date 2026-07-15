-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds a "Weekly" tab to the Branches page, between Daily and Monthly.
-- Each club's window is its OWN most recent 6 distinct operating days
-- (dates with a non-voided checkin) up to and including the selected date
-- — not a fixed 6 calendar days, so a club that was closed some days
-- still gets 6 full days of activity. New/renewed package counts use the
-- calendar range spanning those 6 operating days.

create or replace function branches_weekly_summary(p_date date default current_date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  window_start date,
  window_end date,
  total_cups bigint,
  coach_cup_total bigint,
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
  window_days as (
    select club_id, checkin_date
    from ranked_days
    where rn <= 6
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from window_days
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id
    from my_clubs mc
    cross join lateral coach_cup_excluded_customer_ids(mc.club_id) e
  ),
  cup_totals as (
    select
      wd.club_id,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec where ec.club_id = wd.club_id and ec.customer_id = cu.id
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = wd.club_id and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.nc_level, count(*) as n
    from customers cu
    join windows w on w.club_id = cu.nc_club_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between w.window_start and w.window_end
    group by cu.nc_club_id, cu.nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    join windows w on w.club_id = cu.nc_club_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between w.window_start and w.window_end
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(w.operating_days, 0) as operating_days,
    w.window_start,
    w.window_end,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day
  from my_clubs mc
  left join windows w on w.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  -- Own club first, then branches ranked by Total Cups over the window
  -- (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

grant execute on function branches_weekly_summary(date) to authenticated;
