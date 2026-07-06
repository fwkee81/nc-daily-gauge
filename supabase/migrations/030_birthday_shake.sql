-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds a "Birthday Shake" option to the Check-in page: on a customer's
-- birthday, the free breakfast still counts as a normal check-in (Total
-- Cups, Coach's Cup) but does not deduct from their consumption balance.

alter table checkins add column if not exists is_birthday_shake boolean not null default false;

-- Adding p_member_id changes the argument list, so CREATE OR REPLACE would
-- leave the old 4-arg signature behind as a separate (now-dead) overload —
-- drop it first. Same reasoning applies below for p_is_birthday_shake.
drop function if exists record_checkin(uuid, integer, consumption_type, date);
drop function if exists record_checkin(uuid, integer, consumption_type, date, uuid);

create or replace function record_checkin(
  p_customer_id uuid,
  p_cups integer,
  p_consumption_type consumption_type,
  p_checkin_date date,
  p_member_id uuid default null,
  p_is_birthday_shake boolean default false
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_result checkins;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  if not exists (select 1 from customers where id = p_customer_id and nc_club_id = v_club_id and active) then
    raise exception 'Customer not found in your club';
  end if;

  if p_member_id is not null and not exists (
    select 1 from customer_members where id = p_member_id and customer_id = p_customer_id and active
  ) then
    raise exception 'Family member not found for this customer';
  end if;

  insert into checkins (customer_id, member_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by, is_birthday_shake)
  values (p_customer_id, p_member_id, v_club_id, p_cups, p_consumption_type, p_checkin_date, v_coach_id, p_is_birthday_shake)
  returning * into v_result;

  -- Birthday shake is a free breakfast: check-in and Coach's Cup still count
  -- (they read from checkins.cups directly), but the balance isn't touched.
  if not p_is_birthday_shake then
    update customers set consumption_balance = consumption_balance - p_cups
    where id = p_customer_id;
  end if;

  return v_result;
end;
$$;

grant execute on function record_checkin(uuid, integer, consumption_type, date, uuid, boolean) to authenticated;
