-- Run this in the Supabase SQL editor on your existing project.
--
-- This supersedes 019 (which only checked the immediate inviter) — if you
-- haven't run 019 yet, skip it and just run this one. If you already ran
-- 019, running this is still safe (CREATE OR REPLACE, same signatures).
--
-- New Coach's Cup rule: a customer's checkins never count toward any coach's
-- cup if their own member_type is SP/WT/AWT/TAB, OR if ANY ancestor in their
-- invited-by chain (any number of generations back) has one of those member
-- types — regardless of which coach the customer is assigned to.

-- Every customer in a club whose checkins should NOT count toward any
-- coach's cup: their own member_type is SP/WT/AWT/TAB, or ANY ancestor in
-- their invited-by chain (any number of generations back, via
-- invited_by_customer_id) has one of those member types. This is a property
-- of the customer, independent of which coach they're assigned to.
-- `union` (not `union all`) also makes the recursion safe against a cyclical
-- invited-by chain, should one ever exist — it stops once no new ids surface.
create or replace function coach_cup_excluded_customer_ids(p_club_id uuid default null)
returns table (customer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_customer_id, member_type
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id from club_customers where member_type in ('SP', 'WT', 'AWT', 'TAB')
    union
    select cc.id
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id from tainted;
$$;

grant execute on function coach_cup_excluded_customer_ids(uuid) to authenticated;

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (
  total_cups bigint,
  plugin_cups bigint,
  coach_cup_total bigint,
  dine_in_cups bigint,
  takeaway_cups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (where cu.invited_by_type = 'plugin'), 0) as plugin_cups,
    coalesce(sum(ci.cups) filter (
      where cu.coach_id is not null
        and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_club_id))
    ), 0) as coach_cup_total,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Dine-in'), 0) as dine_in_cups,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Take-away'), 0) as takeaway_cups
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
    and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_club_id))
  group by co.id, co.name
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
  operating_days as (
    select count(distinct checkin_date) as n from club_checkins
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(cc.cups), 0) as total_cups,
    round(coalesce(sum(cc.cups), 0)::numeric / nullif((select n from operating_days), 0), 2) as avg_daily_cups
  from club_checkins cc
  join customers cu on cu.id = cc.customer_id
  join coaches co on co.id = cu.coach_id
  where cu.id not in (
    select customer_id from coach_cup_excluded_customer_ids((select id from target_club))
  )
  group by co.id, co.name
  order by total_cups desc;
$$;
