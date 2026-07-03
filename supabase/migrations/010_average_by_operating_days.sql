-- Run this in the Supabase SQL editor on your existing project.
--
-- Changes "Average NC Cups" / "Average Coach Cups" to divide by operating
-- days (distinct calendar days with at least one non-voided check-in)
-- instead of calendar days elapsed in the month. A day the club didn't
-- open no longer drags the average down.

create or replace function monthly_totals(p_month date, p_club_id uuid default null)
returns table (total_cups bigint, days_in_period int, avg_daily_cups numeric)
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
  club_checkins as (
    select ci.cups, ci.checkin_date
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  operating_days as (
    select count(distinct checkin_date) as n from club_checkins
  )
  select
    coalesce(sum(cups), 0) as total_cups,
    coalesce((select n from operating_days), 0) as days_in_period,
    round(coalesce(sum(cups), 0)::numeric / nullif((select n from operating_days), 0), 2) as avg_daily_cups
  from club_checkins;
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
  where cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB')
  group by co.id, co.name
  order by total_cups desc;
$$;
