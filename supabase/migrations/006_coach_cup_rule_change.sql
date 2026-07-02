-- Run this in the Supabase SQL editor on your existing project.
--
-- Changes the "Coach's Cup" counting rule: previously only counted
-- customers with a non-null Member ID AND member_type in (MB, SC, SB).
-- Now counts any customer with an inviting coach, EXCEPT member types
-- SP, WT, AWT, TAB (a null/unset member_type still counts).

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
  join coaches co on co.id = cu.invited_by_coach_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
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
  effective as (
    select month_start, least(month_end, current_date) as effective_end
    from bounds
  ),
  days as (
    select (greatest(effective_end, month_start) - month_start + 1)::int as n from effective
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as total_cups,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif((select n from days), 0), 2) as avg_daily_cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.invited_by_coach_id
  cross join bounds b
  where ci.checkin_date between b.month_start and b.month_end
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
  group by co.id, co.name
  order by total_cups desc;
$$;
