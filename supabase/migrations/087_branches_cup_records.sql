-- Each visible club's best single day ever (all history, today included —
-- unlike club_all_time_high_cups()/coach_all_time_high_cups(), this is a
-- plain "what's the record" lookup, not a "did today just beat it" check,
-- so there's no reason to exclude today). Powers the Records tab on
-- /branches. club_id/club_name still returned with null record_date/
-- total_cups for a club with no check-ins yet, so every visible club shows
-- up even without a record.
create or replace function branches_cup_records()
returns table (club_id uuid, club_name text, record_date date, total_cups bigint)
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
  daily as (
    select nc_club_id as club_id, checkin_date, sum(cups) as total_cups
    from checkins
    where nc_club_id in (select club_id from my_clubs)
      and not voided
    group by nc_club_id, checkin_date
  ),
  ranked as (
    select
      club_id, checkin_date, total_cups,
      row_number() over (partition by club_id order by total_cups desc, checkin_date desc) as rn
    from daily
  )
  select mc.club_id, mc.club_name, r.checkin_date, r.total_cups
  from my_clubs mc
  left join ranked r on r.club_id = mc.club_id and r.rn = 1
  order by mc.club_name;
$$;

-- Companion to branches_cup_records() — each coach's own best single day
-- ever, within the club they're registered under (same restriction as
-- daily_coach_cups()/branches_monthly_leaderboards(): a customer's "Coach"
-- field can point to a coach registered at a different club, and those
-- don't count toward this club's coach records). Same date-aware
-- exclusion rule as everywhere else Coach's Cup is computed. A coach with
-- no eligible check-ins ever just doesn't appear — no null placeholder
-- row, since (unlike a club) there's no fixed roster to fill in for.
create or replace function branches_coach_cup_records()
returns table (club_id uuid, coach_id uuid, coach_name text, record_date date, cups bigint)
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
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  daily as (
    select cu.coach_id, ci.nc_club_id as club_id, ci.checkin_date, sum(ci.cups) as cups
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    join coaches co on co.id = cu.coach_id
    where ci.nc_club_id in (select club_id from my_clubs)
      and not ci.voided
      and co.nc_club_id = ci.nc_club_id
      and not exists (
        select 1 from excluded_per_club ec
        where ec.club_id = ci.nc_club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
      )
    group by cu.coach_id, ci.nc_club_id, ci.checkin_date
  ),
  ranked as (
    select
      coach_id, club_id, checkin_date, cups,
      row_number() over (partition by coach_id, club_id order by cups desc, checkin_date desc) as rn
    from daily
  )
  select r.club_id, co.id as coach_id, co.name as coach_name, r.checkin_date as record_date, r.cups
  from ranked r
  join coaches co on co.id = r.coach_id
  where r.rn = 1
  order by r.club_id, r.cups desc;
$$;

grant execute on function branches_cup_records() to authenticated;
grant execute on function branches_coach_cup_records() to authenticated;
