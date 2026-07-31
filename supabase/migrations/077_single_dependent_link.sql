-- A primary account may only have one linked (dependent) account at a
-- time — this app only models a couple sharing a balance, not a whole
-- household. Unlink the existing one first before attaching someone else.
create or replace function link_customer_to_spouse(
  p_customer_id uuid,
  p_linked_to_customer_id uuid
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_customer customers%rowtype;
  v_target customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can link customer accounts';
  end if;
  if p_customer_id = p_linked_to_customer_id then
    raise exception 'Cannot link a customer to themselves';
  end if;

  -- Lock both rows (consistent id order avoids deadlocking against a
  -- concurrent link in the opposite direction) before touching balances.
  perform 1 from customers where id in (p_customer_id, p_linked_to_customer_id) order by id for update;

  select * into v_customer from customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  select * into v_target from customers where id = p_linked_to_customer_id;
  if not found then
    raise exception 'Target customer not found';
  end if;

  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id)
     or v_target.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot link customers outside your club';
  end if;

  if v_customer.linked_to_customer_id is not null then
    raise exception '% is already linked to another account', v_customer.name;
  end if;
  if v_target.linked_to_customer_id is not null then
    raise exception '% is itself linked to another account — link to that account''s holder instead', v_target.name;
  end if;
  if exists (select 1 from customers where linked_to_customer_id = p_customer_id) then
    raise exception '% already has other accounts linked to it and cannot be linked to someone else', v_customer.name;
  end if;
  if exists (select 1 from customers where linked_to_customer_id = p_linked_to_customer_id) then
    raise exception '% already has an account linked to it — unlink that one first', v_target.name;
  end if;

  insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
  values (
    p_customer_id, v_coach_id, v_customer.consumption_balance, 0,
    'Linked to ' || v_target.name || E'\'s account — balance merged'
  );

  if v_customer.consumption_balance <> 0 then
    insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
    values (
      p_linked_to_customer_id, v_coach_id, v_target.consumption_balance,
      v_target.consumption_balance + v_customer.consumption_balance,
      'Merged from ' || v_customer.name || E'\'s account (linked)'
    );
  end if;

  update customers
  set consumption_balance = consumption_balance + v_customer.consumption_balance
  where id = p_linked_to_customer_id;

  update customers
  set linked_to_customer_id = p_linked_to_customer_id,
      consumption_balance = 0,
      nc_level = v_target.nc_level
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;
