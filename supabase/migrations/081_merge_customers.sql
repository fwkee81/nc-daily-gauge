-- True-duplicate merge — different from link_customer_to_spouse (which
-- keeps both customer records alive sharing one balance, for couples). This
-- is for when the same real person ended up with two customer records (most
-- often an Ala Carte walk-in re-created instead of reused): every record
-- pointing at the duplicate moves to the survivor, the duplicate's balance
-- folds in, and the duplicate is deactivated (never deleted, so history and
-- audit trail stay intact).
create or replace function merge_customers(p_duplicate_customer_id uuid, p_keep_customer_id uuid)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_duplicate customers%rowtype;
  v_keep customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can merge customer accounts';
  end if;
  if p_duplicate_customer_id = p_keep_customer_id then
    raise exception 'Cannot merge a customer into themselves';
  end if;

  -- Lock both rows (consistent id order avoids deadlocking against a
  -- concurrent merge in the opposite direction) before touching balances.
  perform 1 from customers where id in (p_duplicate_customer_id, p_keep_customer_id) order by id for update;

  select * into v_duplicate from customers where id = p_duplicate_customer_id;
  if not found then
    raise exception 'Duplicate customer not found';
  end if;
  select * into v_keep from customers where id = p_keep_customer_id;
  if not found then
    raise exception 'Customer to keep not found';
  end if;

  if v_duplicate.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id)
     or v_keep.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot merge customers outside your club';
  end if;

  if v_duplicate.linked_to_customer_id is not null or v_keep.linked_to_customer_id is not null
     or exists (select 1 from customers where linked_to_customer_id in (p_duplicate_customer_id, p_keep_customer_id))
  then
    raise exception 'Unlink any shared-balance accounts on either customer before merging';
  end if;

  update checkins set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customer_renewals set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customer_balance_corrections set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update inventory_transactions set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customer_members set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customers set invited_by_customer_id = p_keep_customer_id where invited_by_customer_id = p_duplicate_customer_id;

  if v_duplicate.consumption_balance <> 0 then
    insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
    values (
      p_keep_customer_id, v_coach_id, v_keep.consumption_balance,
      v_keep.consumption_balance + v_duplicate.consumption_balance,
      'Merged from duplicate record ' || v_duplicate.name
    );
    update customers set consumption_balance = consumption_balance + v_duplicate.consumption_balance
    where id = p_keep_customer_id;
  end if;

  update customers
  set active = false,
      consumption_balance = 0,
      remark = case
        when coalesce(remark, '') = '' then 'Merged into ' || v_keep.name || ' on ' || current_date
        else remark || E'\nMerged into ' || v_keep.name || ' on ' || current_date
      end
  where id = p_duplicate_customer_id;

  select * into v_keep from customers where id = p_keep_customer_id;
  return v_keep;
end;
$$;

grant execute on function merge_customers(uuid, uuid) to authenticated;
