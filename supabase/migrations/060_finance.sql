create type finance_direction as enum ('in', 'out');

create type finance_payment_method as enum ('Cash', 'QR', 'Transfer');

-- 'Others' is deliberately shared by both directions (rather than
-- 'Others (In)'/'Others (Out)') — the finance_txn_category_matches_direction
-- check below still validates it's only ever paired with the right list.
create type finance_category as enum (
  '5-Day Card', '10-Day Card', '30-Day Card', 'Ala Carte',
  'Power Cup', 'Fit Club', 'PJS', 'Membership', 'Product Purchased',
  'Ingredients', 'Stock-in', 'Claim', 'Rental', 'Cleaning', 'Others'
);

-- Daily income/expense ledger for the Finance page. Any coach can record an
-- entry for their own club; the Finance Summary view built on top of this
-- is restricted to Owner-level coaches at the app layer (nc_position =
-- 'Owner', narrower than is_admin which also includes Internship) — see
-- the comment on the finance_transactions_select policy below for why that
-- restriction lives in the app rather than RLS. Append-only, same
-- reasoning as daily_report_logs: no update/delete policy.
create table finance_transactions (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  txn_date date not null,
  direction finance_direction not null,
  category finance_category not null,
  amount numeric(10, 2) not null check (amount > 0),
  payment_method finance_payment_method not null,
  -- Required for an income entry, always null for an expense entry.
  customer_name text,
  -- Required for an expense entry (the coach responsible for/claiming it) —
  -- distinct from recorded_by, the coach who actually typed this entry in.
  responsible_coach_id uuid references coaches (id),
  recorded_by uuid references coaches (id),
  created_at timestamptz not null default now(),
  constraint finance_txn_category_matches_direction check (
    (direction = 'in' and category in (
      '5-Day Card', '10-Day Card', '30-Day Card', 'Ala Carte',
      'Power Cup', 'Fit Club', 'PJS', 'Membership', 'Product Purchased', 'Others'
    ))
    or
    (direction = 'out' and category in (
      'Ingredients', 'Stock-in', 'Claim', 'Rental', 'Cleaning', 'Others'
    ))
  ),
  constraint finance_txn_customer_name_for_in check (
    direction <> 'in' or (customer_name is not null and length(trim(customer_name)) > 0)
  ),
  constraint finance_txn_coach_for_out check (
    direction <> 'out' or responsible_coach_id is not null
  )
);

create index idx_finance_transactions_club_date on finance_transactions (nc_club_id, txn_date);

alter table finance_transactions enable row level security;

-- Same visibility + write shape as inventory_transactions — any coach can
-- read their visible clubs' entries and record ones for their own club. The
-- Finance Summary being Owner-only is enforced by the Finance page itself
-- (nc_position check), not by RLS — every coach who can see the page needs
-- to read the raw ledger to add/cross-check entries; only the aggregated
-- summary view is hidden from non-Owners.
create policy "finance_transactions_select" on finance_transactions
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));
create policy "finance_transactions_insert" on finance_transactions
  for insert to authenticated
  with check (
    nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and recorded_by = current_coach_id()
  );
