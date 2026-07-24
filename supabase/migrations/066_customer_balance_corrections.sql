-- Audit trail for direct consumption_balance corrections (e.g. a coach
-- key'd in the wrong starting balance at sign-up). Deliberately separate
-- from customer_renewals — this isn't a package purchase, so it must never
-- be counted as one on the Daily Report's New/Renewals ledger or in
-- Coach's Cup / NC Metrics. Writes go through correct_customer_balance()
-- below, admin-only, reason required.
create table customer_balance_corrections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  corrected_by uuid not null references coaches (id),
  previous_balance integer not null,
  new_balance integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table customer_balance_corrections enable row level security;

-- Read-only to clients, same visibility as the customer they belong to.
-- Writes go through correct_customer_balance() below.
create policy "customer_balance_corrections_select" on customer_balance_corrections
  for select to authenticated
  using (
    customer_id in (
      select id from customers where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

-- Directly sets a customer's consumption_balance (e.g. fixing a wrong
-- starting balance key'd in at sign-up) — NOT a package purchase, so it's
-- logged separately from customer_renewals and never shows up as a
-- "renewal" anywhere (Daily Report ledger, Coach's Cup, NC Metrics).
-- Admin-only, own club, reason required — same correction model as
-- void_checkin()/void_inventory_transaction().
create or replace function correct_customer_balance(
  p_customer_id uuid,
  p_new_balance integer,
  p_reason text
)
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
    raise exception 'Only admins can correct a customer''s balance';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to correct a balance';
  end if;
  if p_new_balance < 0 then
    raise exception 'Balance cannot be negative';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;

  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot correct a customer outside your club';
  end if;

  insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
  values (p_customer_id, v_coach_id, v_customer.consumption_balance, p_new_balance, p_reason);

  update customers set consumption_balance = p_new_balance where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

grant execute on function correct_customer_balance(uuid, integer, text) to authenticated;
