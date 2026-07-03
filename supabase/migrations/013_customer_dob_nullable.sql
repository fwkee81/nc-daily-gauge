-- Run this in the Supabase SQL editor on your existing project.
-- Run 012_ala_carte_nc_level.sql first.
--
-- Makes customers.dob nullable — walk-in/Ala Carte customers are captured
-- with just a name, contact, and who invited them; DOB can be filled in
-- later if they become a regular member. upcoming_birthdays() now skips
-- customers with no DOB on file.

alter table customers alter column dob drop not null;

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
      and cu.dob is not null
      and not (extract(month from cu.dob) = 2 and extract(day from cu.dob) = 29)
  )
  select * from next_bday where days_until between 0 and 3 order by days_until;
$$;
