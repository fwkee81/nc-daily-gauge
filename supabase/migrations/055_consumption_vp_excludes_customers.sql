-- Run this in the Supabase SQL editor on your existing project.
--
-- "Consumption VP" is meant to be product a coach used up themselves
-- (demos, personal use, etc.) — not product sold or loaned to a customer.
-- Excludes any stock-out row with a customer_id set from the four places
-- that compute it: NC Metrics' monthly_inventory_out(), and the Daily/
-- Weekly/Monthly Branches summaries. Only the WHERE/JOIN condition changes
-- (same return columns), so CREATE OR REPLACE works without a drop.

create or replace function monthly_inventory_out(p_month date, p_club_id uuid default null)
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  qty bigint,
  total_vp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  club_out as (
    select t.product_id, t.quantity
    from inventory_transactions t
    cross join bounds b
    cross join target_club tc
    where t.direction = 'out'
      and not t.voided
      and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
      and t.nc_club_id = tc.id
      and t.nc_club_id in (select visible_club_ids(current_coach_id()))
  )
  select
    p.id,
    p.name,
    p.vp,
    sum(co.quantity) as qty,
    sum(co.quantity) * p.vp as total_vp
  from club_out co
  join products p on p.id = co.product_id
  group by p.id, p.name, p.vp
  order by total_vp desc;
$$;

grant execute on function monthly_inventory_out(date, uuid) to authenticated;

create or replace function branches_daily_summary(p_date date)
returns table (
  club_id uuid,
  club_name text,
  total_cups bigint,
  prev_total_cups bigint,
  coach_cup_total bigint,
  prev_coach_cup_total bigint,
  consumption_vp numeric,
  prev_consumption_vp numeric,
  new_5day bigint,
  prev_new_5day bigint,
  total_10day bigint,
  prev_total_10day bigint,
  total_20day bigint,
  prev_total_20day bigint,
  total_30day bigint,
  prev_total_30day bigint,
  prev_date date
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
  prev_days as (
    select mc.club_id, max(ci.checkin_date) as prev_date
    from my_clubs mc
    left join checkins ci
      on ci.nc_club_id = mc.club_id and ci.checkin_date < p_date and not ci.voided
    group by mc.club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id
    from my_clubs mc
    cross join lateral coach_cup_excluded_customer_ids(mc.club_id) e
  ),
  cup_totals as (
    select
      mc.club_id,
      coalesce(sum(ci.cups) filter (where ci.checkin_date = p_date), 0) as total_cups,
      coalesce(sum(ci.cups) filter (where ci.checkin_date = pd.prev_date), 0) as prev_total_cups,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = p_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec where ec.club_id = mc.club_id and ec.customer_id = cu.id
          )
      ), 0) as coach_cup_total,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = pd.prev_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec where ec.club_id = mc.club_id and ec.customer_id = cu.id
          )
      ), 0) as prev_coach_cup_total
    from my_clubs mc
    left join prev_days pd on pd.club_id = mc.club_id
    left join checkins ci
      on ci.nc_club_id = mc.club_id and not ci.voided
      and (ci.checkin_date = p_date or ci.checkin_date = pd.prev_date)
    left join customers cu on cu.id = ci.customer_id
    group by mc.club_id
  ),
  inv_totals as (
    select
      mc.club_id,
      coalesce(sum(t.quantity * p.vp) filter (where t.txn_date = p_date), 0) as consumption_vp,
      coalesce(sum(t.quantity * p.vp) filter (where t.txn_date = pd.prev_date), 0) as prev_consumption_vp
    from my_clubs mc
    left join prev_days pd on pd.club_id = mc.club_id
    left join inventory_transactions t
      on t.nc_club_id = mc.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and (t.txn_date = p_date or t.txn_date = pd.prev_date)
    left join products p on p.id = t.product_id
    group by mc.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.nc_level, cu.created_at::date as d, count(*) as n
    from customers cu
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
    group by cu.nc_club_id, cu.nc_level, cu.created_at::date
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, cr.created_at::date as d, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
    group by cu.nc_club_id, cr.nc_level, cr.created_at::date
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.prev_total_cups, 0) as prev_total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce(ct.prev_coach_cup_total, 0) as prev_coach_cup_total,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce(it.prev_consumption_vp, 0) as prev_consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day' and ns.d = p_date), 0) as new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day' and ns.d = pd.prev_date), 0) as prev_new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day' and r.d = p_date), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day' and r.d = pd.prev_date), 0) as prev_total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day' and r.d = p_date), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day' and r.d = pd.prev_date), 0) as prev_total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day' and r.d = p_date), 0) as total_30day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day' and r.d = pd.prev_date), 0) as prev_total_30day,
    pd.prev_date
  from my_clubs mc
  left join prev_days pd on pd.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  -- Own club first, then branches ranked by today's Total Cups (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

grant execute on function branches_daily_summary(date) to authenticated;

create or replace function branches_weekly_summary(p_date date default current_date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  window_start date,
  window_end date,
  total_cups bigint,
  coach_cup_total bigint,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint,
  daily jsonb
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
  inv_totals as (
    select
      w.club_id,
      coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from windows w
    left join inventory_transactions t
      on t.nc_club_id = w.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between w.window_start and w.window_end
    left join products p on p.id = t.product_id
    group by w.club_id
  ),
  daily_cup_totals as (
    select
      wd.club_id,
      wd.checkin_date,
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
    group by wd.club_id, wd.checkin_date
  ),
  daily_json as (
    select
      club_id,
      jsonb_agg(
        jsonb_build_object(
          'date', checkin_date,
          'total_cups', total_cups,
          'coach_cup_total', coach_cup_total
        )
        order by checkin_date
      ) as daily
    from daily_cup_totals
    group by club_id
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
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day,
    coalesce(dj.daily, '[]'::jsonb) as daily
  from my_clubs mc
  left join windows w on w.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  left join daily_json dj on dj.club_id = mc.club_id
  -- Own club first, then branches ranked by Total Cups over the window
  -- (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

grant execute on function branches_weekly_summary(date) to authenticated;

create or replace function branches_monthly_summary(p_month date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  avg_daily_cups numeric,
  coach_cup_avg_daily numeric,
  consumption_vp numeric,
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
  inv_totals as (
    select
      mc.club_id,
      coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from my_clubs mc
    cross join bounds b
    left join inventory_transactions t
      on t.nc_club_id = mc.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
    left join products p on p.id = t.product_id
    group by mc.club_id
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
    coalesce(it.consumption_vp, 0) as consumption_vp,
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
  left join inv_totals it on it.club_id = mc.club_id
  -- Own club first, then branches ranked by this month's Avg Cups / Day
  -- (highest first) — clubs with no operating days yet sort to the end.
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    round(coalesce(ct.total_cups, 0)::numeric / nullif(od.n, 0), 2) desc nulls last,
    mc.club_name;
$$;

grant execute on function branches_monthly_summary(date) to authenticated;
