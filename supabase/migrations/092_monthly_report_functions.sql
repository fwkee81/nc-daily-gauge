-- Data functions behind the new "Generate Monthly Report" feature on
-- NC Metrics' Monthly tab. Each is scoped the same way as the existing
-- monthly_totals()/monthly_coach_cups()/monthly_package_sales() functions
-- it sits alongside (own club by default, visible_club_ids-gated).

create or replace function monthly_daily_breakdown(p_month date, p_club_id uuid default null)
returns table (
  checkin_date date,
  total_cups bigint,
  dine_in_cups bigint,
  takeaway_cups bigint,
  plugin_cups bigint,
  consumption_vp numeric
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
  club_checkins as (
    select ci.checkin_date, ci.cups, ci.consumption_type, cu.id as customer_id
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  cup_totals as (
    select
      checkin_date,
      coalesce(sum(cups), 0) as total_cups,
      coalesce(sum(cups) filter (where consumption_type = 'Dine-in'), 0) as dine_in_cups,
      coalesce(sum(cups) filter (where consumption_type = 'Take-away'), 0) as takeaway_cups,
      coalesce(sum(cups) filter (
        where customer_id in (select customer_id from plugin_lineage_customer_ids((select id from target_club)))
      ), 0) as plugin_cups
    from club_checkins
    group by checkin_date
  ),
  inv_out as (
    select t.txn_date, sum(t.quantity * p.vp) as consumption_vp
    from inventory_transactions t
    join products p on p.id = t.product_id
    cross join bounds b
    where t.nc_club_id = (select id from target_club)
      and t.direction = 'out'
      and not t.voided
      and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
    group by t.txn_date
  )
  select
    ct.checkin_date,
    ct.total_cups,
    ct.dine_in_cups,
    ct.takeaway_cups,
    ct.plugin_cups,
    coalesce(io.consumption_vp, 0) as consumption_vp
  from cup_totals ct
  left join inv_out io on io.txn_date = ct.checkin_date
  order by ct.checkin_date;
$$;

-- Per-day, per-coach matrix behind the Monthly Report's Coach's Cup page —
-- same eligibility rule as monthly_coach_cups() (which this is a day-level
-- companion to: same total_cups per coach), just also keyed by day. A coach
-- with no eligible check-ins that month doesn't appear, same reasoning as
-- branches_coach_cup_records().
create or replace function monthly_coach_cups_by_day(p_month date, p_club_id uuid default null)
returns table (
  coach_id uuid,
  coach_name text,
  total_cups bigint,
  daily jsonb
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
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  club_checkins as (
    select ci.checkin_date, ci.cups, cu.coach_id
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.coach_id is not null
      and not exists (
        select 1 from excl e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
      )
  ),
  per_day as (
    select coach_id, checkin_date, sum(cups) as cups
    from club_checkins
    group by coach_id, checkin_date
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(pd.cups), 0) as total_cups,
    jsonb_object_agg(pd.checkin_date::text, pd.cups) as daily
  from per_day pd
  join coaches co on co.id = pd.coach_id
  group by co.id, co.name
  order by total_cups desc;
$$;

-- Best and worst single days of the month (total cups), plus the month's
-- best single coach-day — behind the Monthly Report's "Records this month"
-- highlight cards. Same ranking idiom as branches_cup_records()/
-- branches_coach_cup_records(), just bounded to one month/club instead of
-- all history/all branches. Returns one row regardless of data (nulls if
-- the club had no operating days that month).
create or replace function monthly_cup_records(p_month date, p_club_id uuid default null)
returns table (
  highest_date date,
  highest_cups bigint,
  lowest_date date,
  lowest_cups bigint,
  best_coach_id uuid,
  best_coach_name text,
  best_coach_date date,
  best_coach_cups bigint
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
  daily as (
    select ci.checkin_date, sum(ci.cups) as total_cups
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    group by ci.checkin_date
  ),
  ranked_high as (
    select checkin_date, total_cups, row_number() over (order by total_cups desc, checkin_date desc) as rn
    from daily
  ),
  ranked_low as (
    select checkin_date, total_cups, row_number() over (order by total_cups asc, checkin_date desc) as rn
    from daily
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  coach_daily as (
    select cu.coach_id, ci.checkin_date, sum(ci.cups) as cups
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.coach_id is not null
      and not exists (
        select 1 from excl e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
      )
    group by cu.coach_id, ci.checkin_date
  ),
  ranked_coach as (
    select coach_id, checkin_date, cups, row_number() over (order by cups desc, checkin_date desc) as rn
    from coach_daily
  )
  select
    (select checkin_date from ranked_high where rn = 1),
    (select total_cups from ranked_high where rn = 1),
    (select checkin_date from ranked_low where rn = 1),
    (select total_cups from ranked_low where rn = 1),
    (select coach_id from ranked_coach where rn = 1),
    (select co.name from ranked_coach rc join coaches co on co.id = rc.coach_id where rc.rn = 1),
    (select checkin_date from ranked_coach where rn = 1),
    (select cups from ranked_coach where rn = 1);
$$;

-- Opening/restocked/consumed/sold/closing per product for the Monthly
-- Report's Inventory page. "Consumed" mirrors monthly_inventory_out() (a
-- stock-out with no customer_id — the team's own use); "sold" is the other
-- half of stock-outs (a sale/loan to a customer), kept separate so neither
-- silently swallows the other. There's no low-stock threshold anywhere in
-- the schema, so this deliberately doesn't flag one — closing_balance is
-- the plain number, same as inventory_stock_levels() shows today.
create or replace function monthly_inventory_report(p_month date, p_club_id uuid default null)
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  opening_balance bigint,
  restocked_qty bigint,
  consumed_qty bigint,
  sold_qty bigint,
  closing_balance bigint
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
  opening as (
    select
      p.id as product_id,
      coalesce(sum(
        case when t.direction = 'in' then t.quantity
             when t.direction = 'out' then -t.quantity
             else 0 end
      ), 0) as balance
    from products p
    left join inventory_transactions t
      on t.product_id = p.id
      and t.nc_club_id = (select id from target_club)
      and not t.voided
      and t.txn_date < (select month_start from bounds)
    where p.active
    group by p.id
  ),
  month_txns as (
    select t.product_id, t.direction, t.quantity, t.customer_id
    from inventory_transactions t
    cross join bounds b
    where t.nc_club_id = (select id from target_club)
      and not t.voided
      and t.txn_date between b.month_start and b.month_end
  ),
  month_totals as (
    select
      product_id,
      coalesce(sum(quantity) filter (where direction = 'in'), 0) as restocked_qty,
      coalesce(sum(quantity) filter (where direction = 'out' and customer_id is null), 0) as consumed_qty,
      coalesce(sum(quantity) filter (where direction = 'out' and customer_id is not null), 0) as sold_qty
    from month_txns
    group by product_id
  )
  select
    p.id,
    p.name,
    p.vp,
    o.balance as opening_balance,
    coalesce(mt.restocked_qty, 0) as restocked_qty,
    coalesce(mt.consumed_qty, 0) as consumed_qty,
    coalesce(mt.sold_qty, 0) as sold_qty,
    o.balance + coalesce(mt.restocked_qty, 0) - coalesce(mt.consumed_qty, 0) - coalesce(mt.sold_qty, 0) as closing_balance
  from products p
  join opening o on o.product_id = p.id
  left join month_totals mt on mt.product_id = p.id
  where p.active
  order by p.name;
$$;

grant execute on function monthly_daily_breakdown(date, uuid) to authenticated;
grant execute on function monthly_coach_cups_by_day(date, uuid) to authenticated;
grant execute on function monthly_cup_records(date, uuid) to authenticated;
grant execute on function monthly_inventory_report(date, uuid) to authenticated;
