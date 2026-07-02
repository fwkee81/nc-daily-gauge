-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds coach_cup_total, dine_in_cups, and takeaway_cups to daily_totals(),
-- for the Daily Report page's highlighted summary cards. Postgres won't let
-- CREATE OR REPLACE change a function's return columns, so the old version
-- is dropped first.

drop function if exists daily_totals(date, uuid);

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

grant execute on function daily_totals(date, uuid) to authenticated;
