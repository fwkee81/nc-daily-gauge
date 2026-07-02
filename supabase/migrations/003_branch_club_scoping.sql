-- Run this in the Supabase SQL editor on your existing project.
--
-- Changes the reporting RPCs from "auto-merge my club + every branch club
-- I can see" to "just my own club by default", and adds an explicit
-- p_club_id parameter so a specific branch's report can be viewed on its
-- own (never merged with your own numbers). Also adds list_branch_clubs()
-- for the new /branches page.
--
-- Postgres treats a changed argument list as a new function overload rather
-- than a replacement, so the old 1-arg versions are dropped first to avoid
-- leaving stale duplicates behind.

drop function if exists daily_totals(date);
drop function if exists daily_coach_cups(date);
drop function if exists upcoming_birthdays();
drop function if exists monthly_totals(date);
drop function if exists monthly_coach_cups(date);

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (total_cups bigint, plugin_cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (where cu.invited_by_type = 'plugin'), 0) as plugin_cups
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
  join coaches co on co.id = cu.invited_by_coach_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.member_id is not null
    and cu.member_type in ('MB', 'SC', 'SB')
  group by co.id, co.name
  order by cups desc;
$$;

create or replace function upcoming_birthdays(p_club_id uuid default null)
returns table (customer_id uuid, name text, dob date, days_until int)
language sql
stable
security definer
set search_path = public
as $$
  with next_bday as (
    select
      cu.id as customer_id,
      cu.name,
      cu.dob,
      (
        make_date(
          extract(year from current_date)::int +
            case when to_char(cu.dob, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
          extract(month from cu.dob)::int,
          extract(day from cu.dob)::int
        ) - current_date
      )::int as days_until
    from customers cu
    where cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and not (extract(month from cu.dob) = 2 and extract(day from cu.dob) = 29)
  )
  select * from next_bday where days_until between 0 and 3 order by days_until;
$$;

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
  effective as (
    select month_start, least(month_end, current_date) as effective_end
    from bounds
  ),
  days as (
    select (greatest(effective_end, month_start) - month_start + 1)::int as n from effective
  )
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    (select n from days) as days_in_period,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif((select n from days), 0), 2) as avg_daily_cups
  from checkins ci
  cross join bounds b
  where ci.checkin_date between b.month_start and b.month_end
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
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
    and cu.member_id is not null
    and cu.member_type in ('MB', 'SC', 'SB')
  group by co.id, co.name
  order by total_cups desc;
$$;

create or replace function list_branch_clubs()
returns table (club_id uuid, club_name text)
language sql
stable
security definer
set search_path = public
as $$
  select nc.id as club_id, nc.name as club_name
  from nc_clubs nc
  where nc.id in (select visible_club_ids(current_coach_id()))
    and nc.id <> (select nc_club_id from coaches where auth_user_id = auth.uid())
  order by nc.name;
$$;

grant execute on function daily_totals(date, uuid) to authenticated;
grant execute on function daily_coach_cups(date, uuid) to authenticated;
grant execute on function upcoming_birthdays(uuid) to authenticated;
grant execute on function monthly_totals(date, uuid) to authenticated;
grant execute on function monthly_coach_cups(date, uuid) to authenticated;
grant execute on function list_branch_clubs() to authenticated;
