-- Run this in the Supabase SQL editor on your existing project.
-- Safe to run in the same transaction as other statements (no ALTER TYPE
-- here) — but run 018 first if you haven't already.
--
-- New Coach's Cup rule: a customer invited by another customer whose own
-- member_type is SP/WT/AWT/TAB no longer counts toward Coach's Cup, even if
-- the invitee's own member_type would otherwise qualify.

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
        and (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
        and not exists (
          select 1 from customers inviter
          where inviter.id = cu.invited_by_customer_id
            and inviter.member_type in ('SP', 'WT', 'AWT', 'TAB')
        )
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
    and (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
    and not exists (
      select 1 from customers inviter
      where inviter.id = cu.invited_by_customer_id
        and inviter.member_type in ('SP', 'WT', 'AWT', 'TAB')
    )
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
  where (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
    and not exists (
      select 1 from customers inviter
      where inviter.id = cu.invited_by_customer_id
        and inviter.member_type in ('SP', 'WT', 'AWT', 'TAB')
    )
  group by co.id, co.name
  order by total_cups desc;
$$;
