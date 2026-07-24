-- Creates a one-time "Ala Carte" walk-in customer and checks them in for a
-- single cup. Stays active (unlike the old behavior) so recent_walkin_customers()
-- below can find them again next visit instead of a coach re-creating a
-- duplicate — see record_walkin_checkin_existing() for that repeat-visit
-- path. Admin-only.
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

  update customers set consumption_balance = 0 where id = v_customer_id;

  return v_result;
end;
$$;

-- Repeat-visit path for an Ala Carte walk-in found via
-- recent_walkin_customers() — reuses their existing customer row instead of
-- creating a duplicate. Same 1-cup, balance-nets-to-0 pattern as
-- record_walkin_checkin() above, just without the name/contact/invited-by
-- setup since that's already on file. Admin-only, own club, and only ever
-- for a genuine Ala Carte customer (never lets a walk-in checkin silently
-- zero out a real package member's balance).
create or replace function record_walkin_checkin_existing(
  p_customer_id uuid,
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
  v_customer customers%rowtype;
  v_result checkins;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can record a walk-in check-in';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if v_customer.nc_club_id <> v_club_id then
    raise exception 'Cannot check in a customer outside your club';
  end if;
  if v_customer.nc_level <> 'Ala Carte' then
    raise exception 'This is only for Ala Carte walk-in customers';
  end if;

  insert into checkins (customer_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (p_customer_id, v_club_id, 1, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = 0 where id = p_customer_id;

  return v_result;
end;
$$;

-- Ala Carte customers with a check-in in the last 30 days — the searchable
-- pool for the Walk-in dialog's "have they been in recently?" lookup.
-- Someone who hasn't been back in over a month drops out of this list (a
-- fresh walk-in for them creates a new record again via
-- record_walkin_checkin() — treating a month-plus gap as "basically new" is
-- a deliberate simplification, not a bug).
create or replace function recent_walkin_customers(p_club_id uuid default null)
returns table (id uuid, name text, contact text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.contact
  from customers c
  where c.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and c.nc_level = 'Ala Carte'
    and exists (
      select 1 from checkins ci
      where ci.customer_id = c.id
        and ci.checkin_date >= current_date - interval '30 days'
        and not ci.voided
    )
  order by c.name;
$$;

grant execute on function record_walkin_checkin_existing(uuid, consumption_type, date) to authenticated;
grant execute on function recent_walkin_customers(uuid) to authenticated;
