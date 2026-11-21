-- upcoming_birthdays() used the database's real current_date regardless of
-- which day's Daily Report was being viewed — every other section on that
-- page (check-ins, renewals, new customers) is scoped to the day the report
-- picker is set to, so this was the one inconsistent exception: browsing
-- back to a past day still showed "upcoming in the next 3 days" relative to
-- today, not to that past day. Adds p_as_of (defaults to current_date, so
-- any caller not passing it keeps today's behavior) and computes days_until
-- relative to it instead. Drop the old 1-arg signature first — otherwise
-- Postgres treats this as a new overload alongside it, not a replacement.
drop function if exists upcoming_birthdays(uuid);

create or replace function upcoming_birthdays(p_club_id uuid default null, p_as_of date default current_date)
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
          extract(year from p_as_of)::int +
            case when to_char(cu.dob, 'MMDD') < to_char(p_as_of, 'MMDD') then 1 else 0 end,
          extract(month from cu.dob)::int,
          extract(day from cu.dob)::int
        ) - p_as_of
      )::int as days_until
    from customers cu
    where cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.dob is not null
      and not (extract(month from cu.dob) = 2 and extract(day from cu.dob) = 29)
    union all
    select
      cm.id as customer_id,
      cm.name,
      cm.dob,
      (
        make_date(
          extract(year from p_as_of)::int +
            case when to_char(cm.dob, 'MMDD') < to_char(p_as_of, 'MMDD') then 1 else 0 end,
          extract(month from cm.dob)::int,
          extract(day from cm.dob)::int
        ) - p_as_of
      )::int as days_until
    from customer_members cm
    join customers cu on cu.id = cm.customer_id
    where cm.active
      and cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cm.dob is not null
      and not (extract(month from cm.dob) = 2 and extract(day from cm.dob) = 29)
  )
  select * from next_bday where days_until between 0 and 3 order by days_until;
$$;

grant execute on function upcoming_birthdays(uuid, date) to authenticated;
