-- Run this in the Supabase SQL editor on your existing project.
--
-- Daily Report's "Coach's Cup" table was showing every coach with a
-- qualifying check-in, even coaches registered under a completely different
-- Nutrition Club (e.g. they invited a customer who now checks in at a
-- different branch's counter). Coach's Cup now only shows coaches
-- registered under the club being viewed; those "foreign" coaches show up
-- in a new Branches Coach's Cup section instead.

-- "Coach's Cup" is grouped by the customer's assigned coach_id (separate
-- from invited_by — a customer can be invited by another customer or
-- Plug-in and still be "under" a coach for cup attribution). Counts any
-- customer with a coach assigned, EXCEPT those in
-- coach_cup_excluded_customer_ids (own or an ancestor's member type is
-- SP/WT/AWT/TAB). Restricted to coaches registered under the club being
-- viewed — a customer's "Coach" field can point to a coach registered at a
-- different club (e.g. they invited this customer before they moved, or the
-- customer now walks into a different branch), and those show up in
-- daily_branch_coach_cups() instead.
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
    and co.nc_club_id = ci.nc_club_id
  group by co.id, co.name
  order by cups desc;
$$;

-- Companion to daily_coach_cups(): coaches registered under a DIFFERENT club
-- than the one being viewed, who still have cups today because a customer's
-- "Coach" field points to them. Shown in its own "Branches Coach's Cup"
-- section so a club's own Coach's Cup table isn't mixed with other clubs'
-- coaches.
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
    and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_club_id))
    and co.nc_club_id is distinct from ci.nc_club_id
  group by co.id, co.name, ncc.name
  order by cups desc;
$$;

grant execute on function daily_branch_coach_cups(date, uuid) to authenticated;
