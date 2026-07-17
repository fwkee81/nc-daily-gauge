-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds an Inventory page: a per-club product catalog (name + Volume Points)
-- and an append-only ledger of stock in/out movements, mirroring the
-- checkins table's design — on-hand stock is never stored as a running
-- total, it's always computed from the ledger (inventory_stock_levels()).

create type inventory_direction as enum ('in', 'out');

-- Global catalog (Volume Points are fixed by Herbalife's price list, not
-- club-specific) — only admins may add new products, any coach can read the
-- list and pick from it when recording a stock movement.
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  vp numeric(6, 2) not null check (vp >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into products (name, vp) values
  ('F1 Banana', 23.95),
  ('F1 Vanilla', 23.95),
  ('F1 Latte', 23.95),
  ('F1 Cookies', 23.95),
  ('F1 Summer Berries', 23.95),
  ('F1 Chocolate', 23.95),
  ('F1 Red Bean', 23.95),
  ('Aloe Original', 24.95),
  ('Aloe Mandarin', 24.95),
  ('Aloe Mango', 24.95),
  ('Tea Lemon 100g', 34.95),
  ('Tea Peach 100g', 34.95),
  ('Tea Ginger 100g', 34.95),
  ('Tea Lemon 50g', 19.95),
  ('Guarana Tea', 14.75),
  ('Mixed Fibre Apple', 22.95),
  ('Mixed Fibre Original', 22.95),
  ('F3 Protein', 17.95),
  ('Collagen', 43.55),
  ('Niteworks', 48.75),
  ('Garlic Plus', 12.95),
  ('ImmuLift', 9.50),
  ('CR7', 24.90),
  ('F1 Sport', 28.00)
on conflict (name) do nothing;

-- Append-only stock movement ledger, one club at a time (same "own club
-- only" scope as day-to-day check-ins — not merged across branches).
-- On-hand stock is never stored as a running total; it's always derived
-- from this ledger (see inventory_stock_levels() below), same rationale as
-- checkins never storing a running daily total. direction = 'in' covers
-- deliveries/restocks and customer returns; 'out' covers sales, a coach's
-- own consumption, and loans to a customer. customer_id is optional both
-- ways: set it for a sale/loan-out or a return-in, leave null for a plain
-- restock or a coach's own use.
create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  product_id uuid not null references products (id),
  direction inventory_direction not null,
  quantity integer not null check (quantity > 0),
  txn_date date not null,
  customer_id uuid references customers (id),
  recorded_by uuid references coaches (id),
  remark text,
  created_at timestamptz not null default now()
);

create index idx_inventory_transactions_club on inventory_transactions (nc_club_id);
create index idx_inventory_transactions_product on inventory_transactions (product_id);
create index idx_inventory_transactions_date on inventory_transactions (txn_date);

alter table products enable row level security;
alter table inventory_transactions enable row level security;

-- products: readable by any signed-in coach (needed to populate the picker
-- when recording a movement); only admins may add new ones. No update/delete
-- policy yet — editing/retiring a product isn't needed by the app today.
create policy "products_select" on products
  for select to authenticated using (true);
create policy "products_insert_admin" on products
  for insert to authenticated with check (is_current_coach_admin());

-- inventory_transactions: same visibility + write shape as customers — any
-- coach can read their visible clubs' movements, but may only record ones
-- for their own club. No update/delete — a correction is recorded as an
-- offsetting movement, same rationale as checkins never being edited in
-- place.
create policy "inventory_transactions_select" on inventory_transactions
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));
create policy "inventory_transactions_insert" on inventory_transactions
  for insert to authenticated
  with check (
    nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and recorded_by = current_coach_id()
  );

-- Current on-hand quantity per active product for the caller's own club —
-- never stored, always derived from the inventory_transactions ledger (sum
-- of 'in' minus sum of 'out'), same rationale as checkins never storing a
-- running daily total.
create or replace function inventory_stock_levels()
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  on_hand bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.vp,
    coalesce(sum(
      case when t.direction = 'in' then t.quantity
           when t.direction = 'out' then -t.quantity
           else 0 end
    ), 0) as on_hand
  from products p
  left join inventory_transactions t
    on t.product_id = p.id
    and t.nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  where p.active
  group by p.id, p.name, p.vp
  order by p.name;
$$;

grant execute on function inventory_stock_levels() to authenticated;
