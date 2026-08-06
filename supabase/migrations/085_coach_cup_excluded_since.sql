-- Coach's Cup used to exclude a customer entirely based on their CURRENT
-- member_type (SP/WT/AWT/TAB) — promoting someone retroactively erased
-- their cups from their coach's past totals too, not just future ones.
-- This column records WHEN that happened, so exclusion becomes date-aware:
-- checkins before the customer became SP/WT/AWT/TAB still count, only
-- checkins from that date onward stop counting.
alter table customers add column coach_cup_excluded_since date;

-- Preserve current behavior for anyone already SP/WT/AWT/TAB today: treat
-- them as excluded since the beginning of time (rather than leaving this
-- null, which would mean "never excluded" and flip their historical cups
-- back on). Run a one-off UPDATE afterward for any individual customer
-- whose actual promotion date is known (e.g. Winnie -> Carrey) to correct
-- just that customer's date.
update customers
set coach_cup_excluded_since = date '1970-01-01'
where member_type in ('SP', 'WT', 'AWT', 'TAB')
  and coach_cup_excluded_since is null;

-- Auto-stamps coach_cup_excluded_since the first time a customer's
-- member_type becomes one of the Coach's Cup-excluded types (SP/WT/AWT/TAB)
-- — covers every write path (app UI, admin scripts) uniformly, not just one
-- form. Does not clear the date on a later demotion back to a non-excluded
-- type (rare enough not to handle here); an admin would need to null it out
-- by hand to reset that.
create or replace function set_coach_cup_excluded_since()
returns trigger
language plpgsql
as $$
begin
  if new.member_type in ('SP', 'WT', 'AWT', 'TAB')
     and new.coach_cup_excluded_since is null
     and (tg_op = 'INSERT' or old.member_type is distinct from new.member_type)
  then
    new.coach_cup_excluded_since := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_set_coach_cup_excluded_since on customers;
create trigger customers_set_coach_cup_excluded_since
before insert or update on customers
for each row execute function set_coach_cup_excluded_since();

-- Replaces coach_cup_excluded_customer_ids(uuid) — now takes an as-of date,
-- so single-date callers get date-aware exclusion. drop first since the
-- parameter list is changing (CREATE OR REPLACE can't do that).
drop function if exists coach_cup_excluded_customer_ids(uuid);

create or replace function coach_cup_excluded_customer_ids(p_as_of date, p_club_id uuid default null)
returns table (customer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_customer_id, member_type, coach_cup_excluded_since
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id, coalesce(coach_cup_excluded_since, date '1970-01-01') as excluded_since
    from club_customers
    where member_type in ('SP', 'WT', 'AWT', 'TAB')
    union
    select cc.id, t.excluded_since
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id
  from tainted
  where excluded_since <= p_as_of;
$$;

create or replace function coach_cup_exclusion_dates(p_club_id uuid default null)
returns table (customer_id uuid, excluded_since date)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_customer_id, member_type, coach_cup_excluded_since
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id, coalesce(coach_cup_excluded_since, date '1970-01-01') as excluded_since
    from club_customers
    where member_type in ('SP', 'WT', 'AWT', 'TAB')
    union all
    select cc.id, t.excluded_since
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id, min(excluded_since) as excluded_since
  from tainted
  group by id;
$$;

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (
  total_cups bigint,
  plugin_cups bigint,
  coach_cup_total bigint,
  dine_in_cups bigint,
  takeaway_cups bigint,
  consumption_vp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (
      where cu.id in (select customer_id from plugin_lineage_customer_ids(p_club_id))
    ), 0) as plugin_cups,
    -- Mirrors the daily_coach_cups() eligibility rule (coach assigned, not in
    -- coach_cup_excluded_customer_ids), summed across every coach for this
    -- club/date.
    coalesce(sum(ci.cups) filter (
      where cu.coach_id is not null
        and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_date, p_club_id))
    ), 0) as coach_cup_total,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Dine-in'), 0) as dine_in_cups,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Take-away'), 0) as takeaway_cups,
    -- Same definition as branches_daily_summary's consumption_vp: stock-out
    -- with no customer_id (team's own consumption, not a sale/loan).
    coalesce((
      select sum(t.quantity * p.vp)
      from inventory_transactions t
      join products p on p.id = t.product_id
      where t.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
        and t.direction = 'out'
        and not t.voided
        and t.customer_id is null
        and t.txn_date = p_date
    ), 0) as consumption_vp
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

create or replace function daily_coach_cups(p_date date, p_club_id uuid default null)
returns table (coach_id uuid, coach_name text, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.coach_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_date, p_club_id))
    and co.nc_club_id = ci.nc_club_id
  group by co.id, co.name
  order by cups desc;
$$;

create or replace function daily_branch_coach_cups(p_date date, p_club_id uuid default null)
returns table (coach_id uuid, coach_name text, coach_club_name text, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    co.id as coach_id,
    co.name as coach_name,
    ncc.name as coach_club_name,
    coalesce(sum(ci.cups), 0) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.coach_id
  left join nc_clubs ncc on ncc.id = co.nc_club_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_date, p_club_id))
    and co.nc_club_id is distinct from ci.nc_club_id
  group by co.id, co.name, ncc.name
  order by cups desc;
$$;

create or replace function monthly_coach_cups(p_month date, p_club_id uuid default null)
returns table (coach_id uuid, coach_name text, total_cups bigint, avg_daily_cups numeric)
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
  club_checkins as (
    select ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  -- Operating days are based on all of the club's check-in activity that
  -- month, not just the subset that counts toward a coach's cup.
  operating_days as (
    select count(distinct checkin_date) as n from club_checkins
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(cc.cups), 0) as total_cups,
    round(coalesce(sum(cc.cups), 0)::numeric / nullif((select n from operating_days), 0), 2) as avg_daily_cups
  from club_checkins cc
  join customers cu on cu.id = cc.customer_id
  join coaches co on co.id = cu.coach_id
  where not exists (
    select 1 from excl e where e.customer_id = cu.id and cc.checkin_date >= e.excluded_since
  )
  group by co.id, co.name
  order by total_cups desc;
$$;

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
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  cup_totals as (
    select
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
          )
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
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
          )
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
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
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
    and not exists (
      select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
    )
  group by co.id, co.name, w.operating_days
  having coalesce(sum(ci.cups), 0) > 0
  order by avg_cups_per_day desc;
$$;

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
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
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
            select 1 from excluded_per_club ec
            where ec.club_id = mc.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = pd.prev_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = mc.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
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
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      wd.club_id,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = wd.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
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
            select 1 from excluded_per_club ec
            where ec.club_id = wd.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
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

create or replace function branches_coach_cups_compare(p_date date)
returns table (
  club_id uuid,
  coach_id uuid,
  coach_name text,
  cups bigint,
  prev_cups bigint
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
  prev_days as (
    select mc.club_id, max(ci.checkin_date) as prev_date
    from my_clubs mc
    left join checkins ci
      on ci.nc_club_id = mc.club_id and ci.checkin_date < p_date and not ci.voided
    group by mc.club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  )
  select
    ci.nc_club_id as club_id,
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups) filter (where ci.checkin_date = p_date), 0) as cups,
    coalesce(sum(ci.cups) filter (where ci.checkin_date = pd.prev_date), 0) as prev_cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.coach_id
  join prev_days pd on pd.club_id = ci.nc_club_id
  where ci.nc_club_id in (select club_id from my_clubs)
    and not ci.voided
    and (ci.checkin_date = p_date or ci.checkin_date = pd.prev_date)
    and not exists (
      select 1 from excluded_per_club ec
      where ec.club_id = ci.nc_club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
    )
  group by ci.nc_club_id, co.id, co.name
  order by ci.nc_club_id, cups desc;
$$;

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
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      cc.club_id,
      coalesce(sum(cc.cups), 0) as total_cups,
      coalesce(sum(cc.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = cc.club_id and ec.customer_id = cu.id and cc.checkin_date >= ec.excluded_since
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
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cu.nc_level = '5-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  new_30_signups as (
    select cu.coach_id, count(*) as n
    from customers cu
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cu.nc_level = '30-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  renew_30 as (
    select cu.coach_id, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
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
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
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
    join coaches co on co.id = cu.coach_id
    where cu.coach_id is not null
      and co.nc_club_id = cc.club_id
      and not exists (
        select 1 from excluded_per_club ec
        where ec.club_id = cc.club_id and ec.customer_id = cu.id and cc.checkin_date >= ec.excluded_since
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

grant execute on function coach_cup_excluded_customer_ids(date, uuid) to authenticated;
grant execute on function coach_cup_exclusion_dates(uuid) to authenticated;
