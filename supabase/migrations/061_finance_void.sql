-- A mis-entered transaction is never edited in place — it's voided
-- (admin-only, reason required), same correction model as
-- inventory_transactions.voided. Stays visible in the ledger but drops
-- out of the Finance Summary totals.
alter table finance_transactions
  add column voided boolean not null default false,
  add column voided_by uuid references coaches (id),
  add column void_reason text,
  add column voided_at timestamptz;

-- Lets an admin void a mis-entered finance record — same correction model
-- as void_inventory_transaction(): a reason is required, who/when/why is
-- recorded on the row itself, and voided rows drop out of the Finance
-- Summary totals but stay visible in the ledger.
create or replace function void_finance_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_txn finance_transactions%rowtype;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void finance records';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a record';
  end if;

  select * into v_txn from finance_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_txn.voided then
    raise exception 'Already voided';
  end if;
  if v_txn.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot void records outside your club';
  end if;

  update finance_transactions
  set voided = true, voided_by = v_editor_id, void_reason = p_reason, voided_at = now()
  where id = p_transaction_id;
end;
$$;

grant execute on function void_finance_transaction(uuid, text) to authenticated;
