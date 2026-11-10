-- Official invoices, generated from an existing Finance income entry (see
-- finance_transactions) — no new pricing catalog needed, Finance already
-- has default package/ala-carte prices (FINANCE_INCOME_DEFAULT_AMOUNT in
-- code), editable per entry, which is exactly where the amount comes from.

-- Per-club invoice letterhead — every branch is its own legal entity, so
-- this isn't network-wide like holiday_themes; each club's own admin sets
-- it for their own club.
alter table nc_clubs add column if not exists invoice_company_name text;
alter table nc_clubs add column if not exists invoice_address text;
alter table nc_clubs add column if not exists invoice_phone text;
alter table nc_clubs add column if not exists invoice_ssm_no text;
-- Sequential per club, incremented atomically inside create_invoice() below
-- — an official invoice number must never repeat or skip.
alter table nc_clubs add column if not exists invoices_next_number integer not null default 1;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  invoice_number integer not null,
  finance_transaction_id uuid not null references finance_transactions (id),
  -- Snapshot of the finance_transactions row at the moment the invoice was
  -- generated — frozen even if that row is later voided, so a previously
  -- issued invoice never silently changes.
  customer_name text not null,
  customer_contact text,
  category text not null,
  detail text,
  amount numeric(10, 2) not null,
  payment_method text not null,
  txn_date date not null,
  created_by uuid references coaches (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nc_club_id, invoice_number),
  unique (finance_transaction_id)
);

create trigger invoices_set_updated_at
before update on invoices
for each row execute function set_updated_at();

alter table invoices enable row level security;

drop policy if exists "invoices_select" on invoices;
create policy "invoices_select" on invoices
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

-- customer_contact is the only field ever updated after creation (filled
-- in/corrected for the WhatsApp send button) — everything else is a frozen
-- snapshot, written once by create_invoice() below.
drop policy if exists "invoices_update" on invoices;
create policy "invoices_update" on invoices
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

grant select, update on invoices to authenticated;

drop policy if exists "nc_clubs_update" on nc_clubs;
create policy "nc_clubs_update" on nc_clubs
  for update to authenticated
  using (
    is_current_coach_admin()
    and id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

grant update on nc_clubs to authenticated;

-- Admin-only, own club only. Idempotent — re-clicking "Generate Invoice" on
-- an already-invoiced transaction returns the existing invoice instead of
-- minting a new number, since an official invoice number must never be
-- reused or skipped by a duplicate click.
create or replace function create_invoice(p_finance_transaction_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_club_id uuid;
  v_txn finance_transactions%rowtype;
  v_number integer;
  v_invoice invoices%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can generate an invoice';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_txn from finance_transactions where id = p_finance_transaction_id;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if v_txn.nc_club_id <> v_club_id then
    raise exception 'Cannot invoice a transaction outside your club';
  end if;
  if v_txn.direction <> 'in' then
    raise exception 'Only income transactions can be invoiced';
  end if;
  if v_txn.voided then
    raise exception 'Cannot invoice a voided transaction';
  end if;

  select * into v_invoice from invoices where finance_transaction_id = p_finance_transaction_id;
  if found then
    return v_invoice;
  end if;

  select invoices_next_number into v_number from nc_clubs where id = v_club_id for update;
  update nc_clubs set invoices_next_number = v_number + 1 where id = v_club_id;

  insert into invoices (
    nc_club_id, invoice_number, finance_transaction_id, customer_name, category, detail,
    amount, payment_method, txn_date, created_by
  ) values (
    v_club_id, v_number, p_finance_transaction_id, coalesce(v_txn.customer_name, '—'), v_txn.category,
    v_txn.detail, v_txn.amount, v_txn.payment_method, v_txn.txn_date, v_coach_id
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;

grant execute on function create_invoice(uuid) to authenticated;
