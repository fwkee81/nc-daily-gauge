-- Only ever set for a "Custom" renewal (see renew-dialog.tsx) — the reason
-- a coach manually entered a cup count outside the fixed NC levels.
-- Surfaced on the Daily Report's New/Renewals ledger.
alter table customer_renewals add column reason text;

drop function if exists renew_customer(uuid, customer_nc_level, integer);

create or replace function renew_customer(
  p_customer_id uuid,
  p_nc_level customer_nc_level,
  p_cups_added integer,
  p_reason text default null
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_customer customers%rowtype;
  v_new_balance integer;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can renew a customer''s card';
  end if;
  if p_cups_added <= 0 then
    raise exception 'Cups added must be positive';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;

  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot renew a customer outside your club';
  end if;

  v_new_balance := v_customer.consumption_balance + p_cups_added;

  insert into customer_renewals (customer_id, renewed_by, nc_level, cups_added, previous_balance, new_balance, reason)
  values (p_customer_id, v_coach_id, p_nc_level, p_cups_added, v_customer.consumption_balance, v_new_balance, p_reason);

  update customers
  set consumption_balance = v_new_balance, nc_level = p_nc_level
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

grant execute on function renew_customer(uuid, customer_nc_level, integer, text) to authenticated;
