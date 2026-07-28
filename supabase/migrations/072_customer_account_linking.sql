-- Lets two full customer records (typically a couple who each started their
-- own package) share one consumption balance going forward, while each
-- keeps their own customers.id — unlike customer_members, this means both
-- sides can still have their own wellness report, since wellness tables key
-- off customers.id.
--
-- linked_to_customer_id is one-directional and intentionally flat (no
-- chains): a customer can either be a "free" account, a dependent pointing
-- at exactly one other customer, or a balance holder that others point to —
-- never more than one hop. link_customer_to_spouse()/unlink_customer()
-- enforce that below.
alter table customers add column linked_to_customer_id uuid references customers (id);
alter table customers add constraint customers_linked_to_not_self check (linked_to_customer_id is distinct from id);
create index idx_customers_linked_to on customers (linked_to_customer_id);

-- Links p_customer_id's account to p_linked_to_customer_id's so future
-- check-ins for either draw from one shared balance. Any balance still on
-- p_customer_id's account at link time is merged into the target (not
-- frozen — the customer already paid for those cups) and its nc_level is
-- synced to the target's, since the standalone package no longer applies.
-- Both sides of the merge are logged to customer_balance_corrections so
-- there's always a record of who linked the accounts and what the balance
-- was right before the merge.
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

-- Reverses a link. The unlinked account's balance is forfeited (set to 0,
-- not split back out of the shared pool — once merged there's no reliable
-- way to say how much of the shared balance was ever "theirs"), and the
-- account it was linked to keeps everything. Logged the same way as the
-- link itself.
create or replace function unlink_customer(p_customer_id uuid)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_customer customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can unlink a customer account';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot unlink a customer outside your club';
  end if;
  if v_customer.linked_to_customer_id is null then
    raise exception '% is not linked to another account', v_customer.name;
  end if;

  insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
  values (
    p_customer_id, v_coach_id, v_customer.consumption_balance, 0,
    'Unlinked from linked account — balance forfeited'
  );

  update customers
  set linked_to_customer_id = null, consumption_balance = 0
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

grant execute on function link_customer_to_spouse(uuid, uuid) to authenticated;
grant execute on function unlink_customer(uuid) to authenticated;

-- record_checkin, correct_checkin, and void_checkin all move consumption_balance
-- around; each must resolve the linked account's balance holder instead of
-- always crediting/debiting the customer who physically walked in. Argument
-- lists are unchanged, so plain create or replace is enough (no drop needed).

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
  v_balance_customer_id uuid;
  v_result checkins;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select coalesce(linked_to_customer_id, id) into v_balance_customer_id
  from customers where id = p_customer_id and nc_club_id = v_club_id and active;

  if v_balance_customer_id is null then
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
    where id = v_balance_customer_id;
  end if;

  return v_result;
end;
$$;

grant execute on function record_checkin(uuid, integer, consumption_type, date, uuid, boolean) to authenticated;

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
  v_balance_customer_id uuid;
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
    select coalesce(linked_to_customer_id, id) into v_balance_customer_id
    from customers where id = v_checkin.customer_id;

    update customers set consumption_balance = consumption_balance - (v_new_deduction - v_old_deduction)
    where id = v_balance_customer_id;
  end if;
end;
$$;

create or replace function void_checkin(p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_checkin checkins%rowtype;
  v_balance_customer_id uuid;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void check-ins';
  end if;

  select * into v_checkin from checkins where id = p_checkin_id for update;
  if not found then
    raise exception 'Check-in not found';
  end if;
  if v_checkin.voided then
    raise exception 'Already voided';
  end if;
  if v_checkin.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot edit check-ins outside your club';
  end if;

  insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
  values (p_checkin_id, v_editor_id, 'voided', 'false', 'true', p_reason);

  update checkins set voided = true where id = p_checkin_id;

  select coalesce(linked_to_customer_id, id) into v_balance_customer_id
  from customers where id = v_checkin.customer_id;

  update customers set consumption_balance = consumption_balance + v_checkin.cups
  where id = v_balance_customer_id;
end;
$$;
