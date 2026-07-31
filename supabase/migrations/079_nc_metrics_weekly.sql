-- Powers the new "Weekly" tab on /reports/metrics — same "last 6 operating
-- days" window as the Branches Weekly tab, but scoped to a single club
-- (default: caller's own) instead of every visible branch. Mirrors
-- branches_weekly_summary's CTEs; coach_name/coach attribution is always the
-- customer's assigned coach_id, same as Coach's Cup.
create or replace function weekly_totals(p_date date default current_date, p_club_id uuid default null)
returns table (
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
  window_days as (
    select checkin_date from ranked_days where rn <= 6
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from window_days
  ),
  excluded as (
    select customer_id from coach_cup_excluded_customer_ids((select id from target_club))
  ),
  cup_totals as (
    select
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null and cu.id not in (select customer_id from excluded)
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = (select id from target_club) and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
  ),
  inv_totals as (
    select coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from windows w
    left join inventory_transactions t
      on t.nc_club_id = (select id from target_club) and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between w.window_start and w.window_end
    left join products p on p.id = t.product_id
  ),
  daily_cup_totals as (
    select
      wd.checkin_date,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null and cu.id not in (select customer_id from excluded)
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = (select id from target_club) and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.checkin_date
  ),
  daily_json as (
    select jsonb_agg(
      jsonb_build_object('date', checkin_date, 'total_cups', total_cups, 'coach_cup_total', coach_cup_total)
      order by checkin_date
    ) as daily
    from daily_cup_totals
  ),
  new_signups as (
    select cu.nc_level, count(*) as n
    from customers cu
    cross join windows w
    where cu.nc_club_id = (select id from target_club)
      and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between w.window_start and w.window_end
    group by cu.nc_level
  ),
  renewals as (
    select cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join windows w
    where cu.nc_club_id = (select id from target_club)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between w.window_start and w.window_end
    group by cr.nc_level
  )
  select
    coalesce(w.operating_days, 0),
    w.window_start,
    w.window_end,
    coalesce(ct.total_cups, 0),
    coalesce(ct.coach_cup_total, 0),
    coalesce(it.consumption_vp, 0),
    coalesce((select n from new_signups where nc_level = '5-day'), 0),
    coalesce((select n from new_signups where nc_level = '10-day'), 0)
      + coalesce((select n from renewals where nc_level = '10-day'), 0),
    coalesce((select n from new_signups where nc_level = '20-day'), 0)
      + coalesce((select n from renewals where nc_level = '20-day'), 0),
    coalesce((select n from new_signups where nc_level = '30-day'), 0)
      + coalesce((select n from renewals where nc_level = '30-day'), 0),
    coalesce(dj.daily, '[]'::jsonb)
  from windows w
  left join cup_totals ct on true
  left join inv_totals it on true
  left join daily_json dj on true;
$$;

-- Per-customer detail behind weekly_totals' New 5-Day / 10-Day / 20-Day /
-- 30-Day counts, same shape as branches_weekly_new_renewals but for one club.
create or replace function weekly_new_renewals(p_date date default current_date, p_club_id uuid default null)
returns table (
  nc_level customer_nc_level,
  kind text,
  customer_name text,
  coach_name text,
  created_at timestamptz
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
  )
  select
    cu.nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  cross join windows w
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id = (select id from target_club)
    and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between w.window_start and w.window_end

  union all

  select
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  cross join windows w
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id = (select id from target_club)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between w.window_start and w.window_end

  order by nc_level, created_at desc;
$$;

-- Every customer who checked in during the same 6-operating-day window,
-- with how many times — powers the Weekly tab's attendance list so a coach
-- meeting can spot who's coming in often vs. barely showing up.
create or replace function weekly_customer_attendance(p_date date default current_date, p_club_id uuid default null)
returns table (
  customer_id uuid,
  customer_name text,
  coach_name text,
  nc_level customer_nc_level,
  visit_count bigint
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
  )
  select
    cu.id as customer_id,
    cu.name as customer_name,
    co.name as coach_name,
    cu.nc_level,
    count(*) as visit_count
  from checkins ci
  cross join windows w
  join customers cu on cu.id = ci.customer_id
  left join coaches co on co.id = cu.coach_id
  where ci.nc_club_id = (select id from target_club)
    and not ci.voided
    and ci.checkin_date between w.window_start and w.window_end
  group by cu.id, cu.name, co.name, cu.nc_level
  order by visit_count desc, cu.name;
$$;

grant execute on function weekly_totals(date, uuid) to authenticated;
grant execute on function weekly_new_renewals(date, uuid) to authenticated;
grant execute on function weekly_customer_attendance(date, uuid) to authenticated;
