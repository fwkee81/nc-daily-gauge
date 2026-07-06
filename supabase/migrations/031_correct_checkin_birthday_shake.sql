-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds a "Birthday Shake" toggle to the Manage check-in (correction) dialog
-- on Daily Report, so an admin can flip a past check-in to/from a free
-- birthday breakfast. Correctly refunds/charges the customer's consumption
-- balance based on both the old and new birthday-shake state, not just the
-- change in cups.

-- Adding p_new_is_birthday_shake changes the argument list, so CREATE OR
-- REPLACE would leave the old 4-arg signature behind as a separate
-- (now-dead) overload — drop it first.
drop function if exists correct_checkin(uuid, integer, consumption_type, text);

create or replace function correct_checkin(
  p_checkin_id uuid,
  p_new_cups integer,
  p_new_consumption_type consumption_type,
  p_reason text,
  p_new_is_birthday_shake boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_checkin checkins%rowtype;
  v_old_deduction integer;
  v_new_deduction integer;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can correct check-ins';
  end if;
  if p_new_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select * into v_checkin from checkins where id = p_checkin_id for update;
  if not found then
    raise exception 'Check-in not found';
  end if;
  if v_checkin.voided then
    raise exception 'Cannot edit a voided check-in';
  end if;
  if v_checkin.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot edit check-ins outside your club';
  end if;

  if v_checkin.cups is distinct from p_new_cups then
    insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
    values (p_checkin_id, v_editor_id, 'cups', v_checkin.cups::text, p_new_cups::text, p_reason);
  end if;
  if v_checkin.consumption_type is distinct from p_new_consumption_type then
    insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
    values (p_checkin_id, v_editor_id, 'consumption_type', v_checkin.consumption_type::text, p_new_consumption_type::text, p_reason);
  end if;
  if v_checkin.is_birthday_shake is distinct from p_new_is_birthday_shake then
    insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
    values (p_checkin_id, v_editor_id, 'is_birthday_shake', v_checkin.is_birthday_shake::text, p_new_is_birthday_shake::text, p_reason);
  end if;

  update checkins
  set cups = p_new_cups, consumption_type = p_new_consumption_type, is_birthday_shake = p_new_is_birthday_shake
  where id = p_checkin_id;

  -- A birthday shake never deducts from the balance, so the amount to
  -- refund/charge depends on both the old and new birthday-shake state, not
  -- just the change in cups.
  v_old_deduction := case when v_checkin.is_birthday_shake then 0 else v_checkin.cups end;
  v_new_deduction := case when p_new_is_birthday_shake then 0 else p_new_cups end;

  if v_new_deduction <> v_old_deduction then
    update customers set consumption_balance = consumption_balance - (v_new_deduction - v_old_deduction)
    where id = v_checkin.customer_id;
  end if;
end;
$$;

grant execute on function correct_checkin(uuid, integer, consumption_type, text, boolean) to authenticated;
