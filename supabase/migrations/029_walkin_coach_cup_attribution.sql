-- Run this in the Supabase SQL editor on your existing project.
--
-- Fixes: a Walk-in (Ala Carte) customer invited by another CUSTOMER never
-- got a coach_id (only the "invited by a coach" case did), so they could
-- never count toward anyone's Coach's Cup. Now they inherit whichever
-- coach the inviting customer is under. Invited by Plug-in still has no
-- coach to attribute to.

create or replace function record_walkin_checkin(
  p_name text,
  p_contact text,
  p_invited_by_type invited_by_type,
  p_invited_by_coach_id uuid,
  p_invited_by_customer_id uuid,
  p_consumption_type consumption_type,
  p_checkin_date date
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_customer_id uuid;
  v_result checkins;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can add a walk-in customer';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;
  if p_contact is null or btrim(p_contact) = '' then
    raise exception 'Contact is required';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  insert into customers (
    nc_club_id, name, gender, contact, dob, nc_level, consumption_balance,
    invited_by_type, invited_by_coach_id, invited_by_customer_id, coach_id,
    created_by, active
  )
  values (
    v_club_id, p_name, 'Others', p_contact, null, 'Ala Carte', 1,
    p_invited_by_type, p_invited_by_coach_id, p_invited_by_customer_id,
    case
      when p_invited_by_type = 'coach' then p_invited_by_coach_id
      when p_invited_by_type = 'customer' then (
        select coach_id from customers where id = p_invited_by_customer_id
      )
      else null
    end,
    v_coach_id, true
  )
  returning id into v_customer_id;

  insert into checkins (customer_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (v_customer_id, v_club_id, 1, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = 0, active = false where id = v_customer_id;

  return v_result;
end;
$$;

-- One-time backfill: existing walk-ins invited by a customer who never got
-- a coach_id because of the bug above. Scoped to Ala Carte only — a regular
-- customer's coach_id is a deliberate manual choice and shouldn't be
-- touched just because it's blank.
update customers cu
set coach_id = inviter.coach_id
from customers inviter
where cu.nc_level = 'Ala Carte'
  and cu.invited_by_type = 'customer'
  and cu.invited_by_customer_id = inviter.id
  and cu.coach_id is null
  and inviter.coach_id is not null;
