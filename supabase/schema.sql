-- NC App database schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- Assumptions made where the spec was ambiguous are called out inline with "ASSUMPTION:".

-- =========================================================================
-- ENUMS
-- =========================================================================

create type coach_level as enum (
  'SC 35%', 'SB 42%', 'Supervisor', 'World Team', 'Active World Team',
  'GET Team', 'GET 2500RO', 'Millionaire Team', 'MT 7500RO', 'President''s Team'
);

create type nc_position as enum ('Owner', 'Internship', 'NC Partner', 'Junior Coach');

create type customer_gender as enum ('Male', 'Female', 'Couple', 'Family', 'Others');

create type customer_nc_level as enum ('5-day', '10-day', '20-day', '30-day', 'Ala Carte');

create type member_type as enum ('MB', 'SC', 'SB', 'SP', 'WT', 'AWT', 'TAB', 'Non member');

create type consumption_type as enum ('Dine-in', 'Take-away');

create type invited_by_type as enum ('coach', 'customer', 'plugin');

create type inventory_direction as enum ('in', 'out');

create type finance_direction as enum ('in', 'out');

create type finance_payment_method as enum ('Cash', 'QR', 'Transfer');

-- 'Others' is deliberately shared by both directions (rather than
-- 'Others (In)'/'Others (Out)') — the finance_txn_category_matches_direction
-- check below still validates it's only ever paired with the right list.
create type finance_category as enum (
  '5-Day Card', '10-Day Card', '20-Day Card', '30-Day Card', 'Ala Carte',
  'Power Cup', 'Foodie', 'Fit Club', 'PJS', 'Membership', 'Product Purchased',
  'Ingredients', 'Stock-in', 'Claim', 'Rental', 'Cleaning', 'Utility bills', 'Others'
);

-- =========================================================================
-- TABLES
-- =========================================================================

create table nc_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Fixed set of branches a coach can register under (see NC_CLUBS in
-- src/lib/constants.ts, which the onboarding form's Select is limited to).
insert into nc_clubs (name)
values
  ('Wellness Plus+'),
  ('Wellness Garden'),
  ('Wellness Seed'),
  ('Wellness Talk'),
  ('Wellness Star'),
  ('Wellness Hub')
on conflict (name) do nothing;

-- ASSUMPTION: sponsor_id is nullable to allow the very first ("founding") coach
-- to register with no sponsor. The UI still requires a choice ("no sponsor" vs
-- pick a coach) so the intent of "required" is preserved for every coach after
-- the first.
create table coaches (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete cascade,
  name text not null,
  contact text not null,
  dob date not null,
  sponsor_id uuid references coaches (id),
  member_id text not null,
  level coach_level not null,
  nc_club_id uuid references nc_clubs (id),
  nc_position nc_position not null,
  is_admin boolean generated always as (nc_position in ('Owner', 'Internship')) stored,
  -- Soft delete, same rationale as customers.active: coaches are referenced by
  -- customers (invited_by_coach_id, created_by), checkins (recorded_by),
  -- checkin_edits (edited_by), and other coaches (sponsor_id).
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  name text not null,
  gender customer_gender not null,
  contact text not null,
  -- Nullable: walk-in/Ala Carte customers are captured with just a name,
  -- contact, and who invited them — DOB can be filled in later if they
  -- become a regular member.
  dob date,
  age_override integer,
  nc_level customer_nc_level not null,
  -- Set once at creation and never touched again (nc_level above is CURRENT
  -- level and gets overwritten by renew_customer() on every renewal) — the
  -- only reliable way to answer "what level did this customer start at",
  -- which is what every New 5-Day/10-Day/20-Day/30-Day count needs to
  -- classify a "new" signup correctly even if the customer has since
  -- upgraded within the same reporting window.
  initial_nc_level customer_nc_level not null,
  consumption_balance integer not null default 0,
  -- Denormalized running Loyalty Program balance, same pattern as
  -- consumption_balance above; kept in sync by record_checkin()/
  -- correct_checkin()/void_checkin() plus the loyalty_* RPCs below.
  loyalty_points_balance integer not null default 0,
  invited_by_type invited_by_type not null,
  invited_by_coach_id uuid references coaches (id),
  invited_by_customer_id uuid references customers (id),
  -- Separate from invited_by: the coach this customer is "under" for
  -- Coach's Cup attribution. Invited by can be a coach, another customer, or
  -- Plug-in, but Coach's Cup should still be assignable to a coach either way.
  coach_id uuid references coaches (id),
  member_id text,
  member_type member_type,
  -- First date member_type became SP/WT/AWT/TAB (Coach's Cup-excluded) —
  -- lets exclusion be date-aware: checkins before this date still count
  -- toward the coach, only checkins from this date on stop counting. Set
  -- automatically by the customers_set_coach_cup_excluded_since trigger,
  -- not editable in the UI. Null means never excluded.
  coach_cup_excluded_since date,
  remark text,
  -- One-directional and flat (no chains): set once this customer's own
  -- package is exhausted and their account is merged into another
  -- customer's shared balance. See link_customer_to_spouse()/
  -- unlink_customer() below — unlike customer_members, both sides here
  -- keep their own customers.id, so both can still have a wellness report.
  linked_to_customer_id uuid references customers (id),
  -- Manual designations a coach ticks on the customer's profile — independent
  -- of any computed report (e.g. NC Metrics' Health Ambassador leaderboard,
  -- which is based on referral counts, not this flag).
  is_pjs boolean not null default false,
  is_health_ambassador boolean not null default false,
  created_by uuid references coaches (id),
  -- Soft delete: customers are never hard-deleted because checkins.customer_id
  -- references them (and we want historical reports to keep working). "Remove"
  -- in the UI sets active = false and hides them from search/listing.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invited_by_consistency check (
    (invited_by_type = 'coach' and invited_by_coach_id is not null and invited_by_customer_id is null) or
    (invited_by_type = 'customer' and invited_by_customer_id is not null and invited_by_coach_id is null) or
    (invited_by_type = 'plugin' and invited_by_coach_id is null and invited_by_customer_id is null)
  ),
  constraint customers_linked_to_not_self check (linked_to_customer_id is distinct from id)
);

-- A spouse/family member who shares an existing customer's consumption
-- balance and NC package, but should still be found by their own name at
-- check-in (e.g. the spouse walks in without the account holder). Their
-- check-ins deduct from the parent customer's balance, not a separate one.
create table customer_members (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  name text not null,
  contact text,
  dob date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ASSUMPTION: checkin_date is supplied by the app (client's local calendar date)
-- rather than derived from the DB server clock, so club-local "today" is correct
-- regardless of where Supabase's servers run.
create table checkins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  -- Set when the person who actually checked in is a shared family member
  -- rather than the account holder — purely for display (Daily Report shows
  -- their name). The balance deducted is still the parent customer's.
  member_id uuid references customer_members (id),
  nc_club_id uuid not null references nc_clubs (id),
  cups integer not null check (cups in (1, 2)),
  consumption_type consumption_type not null,
  checkin_date date not null,
  recorded_by uuid references coaches (id),
  voided boolean not null default false,
  -- Free birthday breakfast: still counts as a normal check-in (total cups,
  -- Coach's Cup) but does not deduct from the customer's consumption balance.
  is_birthday_shake boolean not null default false,
  created_at timestamptz not null default now()
);

-- Audit trail for admin corrections to a check-in (who changed what and why).
create table checkin_edits (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkins (id),
  edited_by uuid not null references coaches (id),
  field_changed text not null,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);

-- Audit trail for NC card renewals (customer tops up their consumption
-- balance). Kept as its own table, distinct from checkin_edits, since a
-- renewal isn't a correction to a past check-in.
create table customer_renewals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  renewed_by uuid not null references coaches (id),
  nc_level customer_nc_level not null,
  cups_added integer not null check (cups_added > 0),
  previous_balance integer not null,
  new_balance integer not null,
  -- Only ever set for a "Custom" renewal (see renew-dialog.tsx) — the reason
  -- a coach manually entered a cup count outside the fixed NC levels.
  -- Surfaced on the Daily Report's New/Renewals ledger.
  reason text,
  created_at timestamptz not null default now()
);

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

-- A running log of notable events for the day on a club's Daily Report —
-- sits right after the New/Renewals ledger. NOT tied to any one customer or
-- ledger row (that was an earlier, wrong design) — just free-text entries a
-- coach adds over the course of the day. Editable and deletable (not a
-- financial record, so no audit trail needed) but only by whoever wrote it,
-- or an admin acting on someone else's behalf — see the update/delete
-- policies below.
-- log_date is set explicitly from whichever date the Daily Report page is
-- viewing (not always "today"), so backfilling a past day's notes works the
-- same way backfilling check-ins does.
create table daily_report_logs (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  log_date date not null,
  note text not null,
  created_by_coach_id uuid references coaches (id),
  created_at timestamptz not null default now()
);
create index idx_daily_report_logs_club_date on daily_report_logs (nc_club_id, log_date);

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
  created_at timestamptz not null default now(),
  -- A movement is never edited in place — a mistake is voided (admin-only,
  -- reason required), same correction model as checkins.voided. No separate
  -- history table since void is the only correction path here.
  voided boolean not null default false,
  voided_by uuid references coaches (id),
  void_reason text,
  voided_at timestamptz
);

-- Daily income/expense ledger for the Finance page. Any coach can record an
-- entry for their own club; the Finance Summary view built on top of this
-- is restricted to Owner-level coaches at the app layer (nc_position =
-- 'Owner', narrower than is_admin which also includes Internship) — see
-- the comment on the finance_transactions_select policy below for why that
-- restriction lives in the app rather than RLS. Append-only: financial
-- records are voided rather than edited, to keep an audit trail — no
-- update/delete policy.
create table finance_transactions (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  txn_date date not null,
  direction finance_direction not null,
  category finance_category not null,
  -- Required when category = 'Others' (either direction) — what it actually
  -- is, since 'Others' alone isn't useful in the ledger. Null otherwise.
  detail text,
  amount numeric(10, 2) not null check (amount > 0),
  payment_method finance_payment_method not null,
  -- Required for an income entry, always null for an expense entry.
  customer_name text,
  -- Required on every entry (both directions) — for income, the coach
  -- responsible for/credited with the sale; for expense, the coach
  -- responsible for/claiming it. Distinct from recorded_by, the coach who
  -- actually typed this entry in (may be a different person).
  responsible_coach_id uuid references coaches (id),
  recorded_by uuid references coaches (id),
  -- Optional free-text note on any entry, independent of `detail` above
  -- (which is specifically the required "what is it" for category = 'Others').
  remark text,
  created_at timestamptz not null default now(),
  -- A mis-entered transaction is never edited in place — it's voided
  -- (admin-only, reason required), same correction model as
  -- inventory_transactions.voided. Stays visible in the ledger but drops
  -- out of the Finance Summary totals.
  voided boolean not null default false,
  voided_by uuid references coaches (id),
  void_reason text,
  voided_at timestamptz,
  constraint finance_txn_category_matches_direction check (
    (direction = 'in' and category in (
      '5-Day Card', '10-Day Card', '20-Day Card', '30-Day Card', 'Ala Carte',
      'Power Cup', 'Foodie', 'Fit Club', 'PJS', 'Membership', 'Product Purchased', 'Others'
    ))
    or
    (direction = 'out' and category in (
      'Ingredients', 'Stock-in', 'Claim', 'Rental', 'Cleaning', 'Utility bills', 'Others'
    ))
  ),
  constraint finance_txn_customer_name_for_in check (
    direction <> 'in' or (customer_name is not null and length(trim(customer_name)) > 0)
  ),
  constraint finance_txn_responsible_coach_required check (
    responsible_coach_id is not null
  ),
  constraint finance_txn_detail_for_others check (
    category <> 'Others' or (detail is not null and length(trim(detail)) > 0)
  )
);

-- Shake Recipes library: a shared catalog of nutrition shake recipes, each
-- broken into the 5 layers coaches already write on their reference cards
-- (Base / Side / Shake / Body / Topping). Admin-only test rollout for now —
-- gated end to end by is_super_admin() (table RLS + the storage bucket for
-- recipe photos below), same account as coaches' super-admin gate.
create sequence if not exists shake_recipe_code_seq;

create table if not exists shake_recipes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('S' || lpad(nextval('shake_recipe_code_seq')::text, 3, '0')),
  name_zh text not null,
  name_en text not null,
  base text not null,
  side text not null,
  shake text not null,
  body text not null,
  topping text not null,
  photo_url text,
  -- Small fixed palette (see RECIPE_COLORS in the app) for "find the blue
  -- ones" style filtering. Ingredient search is plain text search over the
  -- fields above instead of a second tag list.
  colors text[] not null default '{}',
  -- A recipe is visible to every club when is_public, otherwise only to its
  -- own club (nc_club_id, the creating coach's club) — a new recipe always
  -- starts private/club-scoped. public_requested is a coach's "Share to
  -- Public" flag, resolved by the super admin (who alone can set
  -- is_public); once a recipe is public, only the super admin may edit or
  -- delete it — see the RLS policies below.
  nc_club_id uuid references nc_clubs (id),
  is_public boolean not null default false,
  public_requested boolean not null default false,
  created_by uuid references coaches (id),
  created_at timestamptz not null default now()
);

create index idx_customers_nc_club on customers (nc_club_id);
create index idx_customers_invited_by_coach on customers (invited_by_coach_id);
create index idx_customers_invited_by_customer on customers (invited_by_customer_id);
create index idx_customers_coach on customers (coach_id);
create index idx_customers_name on customers (name);
create index idx_customers_linked_to on customers (linked_to_customer_id);
create index idx_customer_members_customer on customer_members (customer_id);
create index idx_coaches_sponsor on coaches (sponsor_id);
create index idx_checkins_customer on checkins (customer_id);
create index idx_checkins_member on checkins (member_id);
create index idx_checkins_club_date on checkins (nc_club_id, checkin_date);
create index idx_checkin_edits_checkin on checkin_edits (checkin_id);
create index idx_customer_renewals_customer on customer_renewals (customer_id);
create index idx_inventory_transactions_club on inventory_transactions (nc_club_id);
create index idx_inventory_transactions_product on inventory_transactions (product_id);
create index idx_inventory_transactions_date on inventory_transactions (txn_date);
create index idx_finance_transactions_club_date on finance_transactions (nc_club_id, txn_date);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_set_updated_at
before update on customers
for each row execute function set_updated_at();

-- Auto-stamps coach_cup_excluded_since the first time a customer's
-- member_type becomes one of the Coach's Cup-excluded types (SP/WT/AWT/TAB)
-- — covers every write path (app UI, admin scripts) uniformly, not just one
-- form. Does not clear the date on a later demotion back to a non-excluded
-- type (rare enough not to handle here); an admin would need to null it out
-- by hand to reset that.
create or replace function set_coach_cup_excluded_since()
returns trigger
language plpgsql
as $$
begin
  if new.member_type in ('SP', 'WT', 'AWT', 'TAB')
     and new.coach_cup_excluded_since is null
     and (tg_op = 'INSERT' or old.member_type is distinct from new.member_type)
  then
    new.coach_cup_excluded_since := current_date;
  end if;
  return new;
end;
$$;

create trigger customers_set_coach_cup_excluded_since
before insert or update on customers
for each row execute function set_coach_cup_excluded_since();

-- =========================================================================
-- HELPER FUNCTIONS (identity + visibility)
-- =========================================================================

create or replace function current_coach_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from coaches where auth_user_id = auth.uid();
$$;

create or replace function is_current_coach_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from coaches where auth_user_id = auth.uid()), false);
$$;

-- One hardcoded network-wide super admin (the founding account) who is the
-- only one allowed to edit/deactivate ANY coach record — including coaches
-- in downline (sponsored) clubs. Every other admin can view their downline
-- network's coaches but not edit them, avoiding cross-club edit disputes.
create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select email from auth.users where id = auth.uid()) = 'fwkee81@gmail.com',
    false
  );
$$;

-- Returns every nc_club a coach is allowed to see reports for: their own club,
-- plus any club whose Owner traces back to them through the sponsor chain
-- (i.e. a branch NC owner who named this coach as their sponsor, directly or
-- via further branches sponsored beneath that owner).
create or replace function visible_club_ids(p_coach_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select id, nc_club_id, sponsor_id, nc_position
    from coaches
    where id = p_coach_id
    union all
    select c.id, c.nc_club_id, c.sponsor_id, c.nc_position
    from coaches c
    join downline d on c.sponsor_id = d.id
    where c.nc_position = 'Owner'
  )
  select distinct nc_club_id from downline where nc_club_id is not null;
$$;

-- auth.users isn't exposed to PostgREST directly, so this is the only way
-- for the Coaches admin page to show each coach's login email (handy for
-- telling apart two accounts that registered with near-identical names).
-- Admin-only, same visibility scope as the coaches list itself: your own
-- club plus any downline branch that named you sponsor.
create or replace function network_coach_emails()
returns table (coach_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select co.id as coach_id, u.email
  from coaches co
  join auth.users u on u.id = co.auth_user_id
  where is_current_coach_admin()
    and co.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

-- PostgREST's client representation of a bare `setof uuid` RPC result isn't
-- something to rely on from the client — wrap it in a proper table type
-- (one named column) for direct client-side calls, same pattern as
-- list_branch_clubs(). SQL-to-SQL callers keep using visible_club_ids()
-- directly (e.g. inside RLS policies and other functions).
create or replace function list_visible_club_ids(p_coach_id uuid)
returns table (club_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select v.club_id from visible_club_ids(p_coach_id) as v(club_id);
$$;

grant execute on function current_coach_id() to authenticated;
grant execute on function is_current_coach_admin() to authenticated;
grant execute on function is_super_admin() to authenticated;
grant execute on function network_coach_emails() to authenticated;
grant execute on function visible_club_ids(uuid) to authenticated;
grant execute on function list_visible_club_ids(uuid) to authenticated;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table nc_clubs enable row level security;
alter table coaches enable row level security;
alter table customers enable row level security;
alter table customer_members enable row level security;
alter table checkins enable row level security;
alter table checkin_edits enable row level security;
alter table customer_renewals enable row level security;
alter table customer_balance_corrections enable row level security;
alter table daily_report_logs enable row level security;
alter table products enable row level security;
alter table inventory_transactions enable row level security;
alter table finance_transactions enable row level security;

-- nc_clubs: club names aren't sensitive; any signed-in coach can search/create
-- one during onboarding (find-or-create by name).
create policy "nc_clubs_select" on nc_clubs
  for select to authenticated using (true);
create policy "nc_clubs_insert" on nc_clubs
  for insert to authenticated with check (true);

-- coaches: readable by any signed-in coach (needed to populate sponsor /
-- invited-by pickers, including across clubs, and so any admin can view
-- their downline network's coaches). A coach may freely edit every field on
-- their own row, including position, level, sponsor, club, member ID, and
-- active status — self-service via the Profile page. The super admin may
-- additionally edit any OTHER coach's row (e.g. downline coaches), which a
-- regular coach cannot do.
create policy "coaches_select" on coaches
  for select to authenticated using (true);
create policy "coaches_insert_self" on coaches
  for insert to authenticated with check (auth_user_id = auth.uid());
create policy "coaches_update_self" on coaches
  for update to authenticated using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
-- is_super_admin() is already the only gate that matters here — it's a
-- single hardcoded account, not a per-branch admin role — so this
-- deliberately does NOT also restrict nc_club_id to visible_club_ids().
-- That extra check used to block the super admin from reassigning a coach
-- to a club that isn't (yet) reachable through the sponsor tree, e.g. a
-- club whose Owner hasn't registered yet, or a standalone test account.
create policy "coaches_update_admin" on coaches
  for update to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- customers: visible across visible clubs (own + sponsored branches); only
-- admins (Owner/Internship) may write, and only within their own club.
create policy "customers_select" on customers
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "customers_insert_admin" on customers
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "customers_update_admin" on customers
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

-- No hard-delete policy for customers: checkins reference them, so "removing"
-- a customer is a soft delete (active = false) via the update policy above.

-- customer_members: same visibility as the parent customer; only admins may
-- write, and only for a customer within their own club.
create policy "customer_members_select" on customer_members
  for select to authenticated
  using (
    customer_id in (
      select id from customers where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

create policy "customer_members_insert_admin" on customer_members
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and customer_id in (
      select id from customers where nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  );

create policy "customer_members_update_admin" on customer_members
  for update to authenticated
  using (
    is_current_coach_admin()
    and customer_id in (
      select id from customers where nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  )
  with check (
    is_current_coach_admin()
    and customer_id in (
      select id from customers where nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  );

-- No hard-delete policy for customer_members either — "removing" a member is
-- a soft delete (active = false) via the update policy above.

-- checkins / checkin_edits: read-only to clients. All writes go through the
-- SECURITY DEFINER functions below so balance updates + audit rows stay
-- atomic and can't be forged from the client.
create policy "checkins_select" on checkins
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "checkin_edits_select" on checkin_edits
  for select to authenticated
  using (
    checkin_id in (
      select id from checkins where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

-- customer_renewals: read-only to clients, same visibility as the customer
-- they belong to. Writes go through the renew_customer() RPC below.
create policy "customer_renewals_select" on customer_renewals
  for select to authenticated
  using (
    customer_id in (
      select id from customers where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

-- customer_balance_corrections: read-only to clients, same visibility as
-- the customer they belong to. Writes go through correct_customer_balance()
-- below.
create policy "customer_balance_corrections_select" on customer_balance_corrections
  for select to authenticated
  using (
    customer_id in (
      select id from customers where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

-- daily_report_logs: same club-scoped visibility as everything else, but
-- writable directly (not via an RPC) since there's no balance/atomicity
-- concern here — just enforce that a coach can only ever attribute an entry
-- to themselves. Editable/deletable by whoever wrote it (fixing a typo or
-- pulling a wrong entry shouldn't need an RPC or an audit trail), or by an
-- admin on anyone's entry.
create policy "daily_report_logs_select" on daily_report_logs
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "daily_report_logs_insert" on daily_report_logs
  for insert to authenticated
  with check (
    created_by_coach_id = current_coach_id()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  );

create policy "daily_report_logs_update" on daily_report_logs
  for update to authenticated
  using (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = current_coach_id() or is_current_coach_admin())
  )
  with check (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = current_coach_id() or is_current_coach_admin())
  );

create policy "daily_report_logs_delete" on daily_report_logs
  for delete to authenticated
  using (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = current_coach_id() or is_current_coach_admin())
  );

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

-- finance_transactions: same visibility + write shape as inventory_transactions
-- — any coach can read their visible clubs' entries and record ones for
-- their own club. The Finance Summary being Owner-only is enforced by the
-- Finance page itself (nc_position check), not by RLS — every coach who can
-- see the page needs to read the raw ledger to add/cross-check entries;
-- only the aggregated summary view is hidden from non-Owners.
create policy "finance_transactions_select" on finance_transactions
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));
create policy "finance_transactions_insert" on finance_transactions
  for insert to authenticated
  with check (
    nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and recorded_by = current_coach_id()
  );

-- shake_recipes: any coach may read a public recipe or one from their own
-- club, but only the super admin may add, edit, or delete a recipe — the
-- library is fully admin-curated, everyone else gets view-only.
-- public_requested is unused by the app for now (left over from an
-- earlier per-coach "Share to Public" flow that's been retired).
drop policy if exists "shake_recipes_select_admin" on shake_recipes;
drop policy if exists "shake_recipes_insert_admin" on shake_recipes;
drop policy if exists "shake_recipes_delete_admin" on shake_recipes;
drop policy if exists "shake_recipes_select" on shake_recipes;
create policy "shake_recipes_select" on shake_recipes
  for select to authenticated
  using (
    is_public
    or nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    or is_super_admin()
  );
drop policy if exists "shake_recipes_insert" on shake_recipes;
create policy "shake_recipes_insert" on shake_recipes
  for insert to authenticated with check (is_super_admin());
drop policy if exists "shake_recipes_update" on shake_recipes;
create policy "shake_recipes_update" on shake_recipes
  for update to authenticated using (is_super_admin()) with check (is_super_admin());
drop policy if exists "shake_recipes_delete" on shake_recipes;
create policy "shake_recipes_delete" on shake_recipes
  for delete to authenticated using (is_super_admin());

-- Storage bucket for recipe photos — public read (so <img src> just works);
-- writes follow the same trust level as the table above (any coach), since
-- the bucket has no per-object ownership to check against.
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

drop policy if exists "recipe_photos_select_public" on storage.objects;
create policy "recipe_photos_select_public" on storage.objects
  for select using (bucket_id = 'recipe-photos');
drop policy if exists "recipe_photos_insert_admin" on storage.objects;
drop policy if exists "recipe_photos_insert" on storage.objects;
create policy "recipe_photos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-photos');
drop policy if exists "recipe_photos_delete_admin" on storage.objects;
drop policy if exists "recipe_photos_delete" on storage.objects;
create policy "recipe_photos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-photos');

-- Loyalty Program: 10-Day/20-Day/30-Day customers (5-Day and Ala Carte are
-- not eligible) earn points automatically on every check-in and by hand for
-- referrals/events, redeemable for gifts/vouchers. Optional per club —
-- loyalty_settings.enabled defaults to false and nothing here ever changes
-- behavior for a club that hasn't turned it on. Points are always
-- cups × points_per_cup, never a flat per-visit amount, so they can be kept
-- exactly in sync when a check-in is later voided or its cups edited (see
-- the record_checkin()/correct_checkin()/void_checkin() changes below).

create table loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null unique references nc_clubs (id),
  enabled boolean not null default false,
  points_per_cup integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger loyalty_settings_set_updated_at
before update on loyalty_settings
for each row execute function set_updated_at();

-- Manual-award reasons (Referral, Event Participation, ...) an admin picks
-- from when awarding bonus points — is_default marks the starter set
-- Claude seeds; a club can deactivate those or add their own on top.
create table loyalty_earn_rules (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  label text not null,
  points integer not null check (points > 0),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Redeemable catalog (gifts, cash vouchers, ...) — same is_default/active
-- shape as loyalty_earn_rules.
create table loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  name text not null,
  points_cost integer not null check (points_cost > 0),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Immutable audit trail behind customers.loyalty_points_balance, same
-- pattern as customer_renewals/inventory_transactions. 'adjustment' rows
-- are how a later cup-count edit stays reflected without ever rewriting the
-- original 'checkin' row — same immutable-ledger-plus-correction-row spirit
-- as customer_balance_corrections sitting alongside customer_renewals.
create table loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  nc_club_id uuid not null references nc_clubs (id),
  points integer not null check (points <> 0),
  kind text not null check (kind in ('checkin', 'adjustment', 'manual', 'redeem')),
  checkin_id uuid references checkins (id),
  earn_rule_id uuid references loyalty_earn_rules (id),
  reward_id uuid references loyalty_rewards (id),
  reason text,
  recorded_by uuid not null references coaches (id),
  created_at timestamptz not null default now(),
  voided boolean not null default false,
  voided_by uuid references coaches (id),
  voided_at timestamptz,
  void_reason text
);

create index idx_loyalty_points_ledger_customer on loyalty_points_ledger (customer_id);
create index idx_loyalty_points_ledger_checkin on loyalty_points_ledger (checkin_id) where checkin_id is not null;

alter table loyalty_settings enable row level security;
alter table loyalty_earn_rules enable row level security;
alter table loyalty_rewards enable row level security;
alter table loyalty_points_ledger enable row level security;

-- Read: any coach can see their visible clubs' loyalty setup/history, same
-- visibility as Finance/Customers. Write: admin-only, own club only (not
-- branch-wide), same shape as customers_insert_admin/customers_update_admin.
-- loyalty_points_ledger has no insert/update policy for authenticated at
-- all — every write goes through the security definer RPCs below, same as
-- customer_renewals.

create policy "loyalty_settings_select" on loyalty_settings
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "loyalty_settings_insert_admin" on loyalty_settings
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_settings_update_admin" on loyalty_settings
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_earn_rules_select" on loyalty_earn_rules
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "loyalty_earn_rules_insert_admin" on loyalty_earn_rules
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_earn_rules_update_admin" on loyalty_earn_rules
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

-- Lets an admin remove a mistakenly-added rule outright, not just
-- deactivate it. Still safe: loyalty_points_ledger.earn_rule_id references
-- this table with no cascade, so Postgres refuses to delete one that's
-- already been used (foreign key violation) — surfaced by the app as
-- "turn it off instead" rather than a raw DB error.
create policy "loyalty_earn_rules_delete_admin" on loyalty_earn_rules
  for delete to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_rewards_select" on loyalty_rewards
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "loyalty_rewards_insert_admin" on loyalty_rewards
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_rewards_update_admin" on loyalty_rewards
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

-- Same reasoning as loyalty_earn_rules_delete_admin above.
create policy "loyalty_rewards_delete_admin" on loyalty_rewards
  for delete to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_points_ledger_select" on loyalty_points_ledger
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));


-- =========================================================================
-- WRITE RPCs (check-in, corrections)
-- =========================================================================

-- Adding p_member_id changes the argument list, so CREATE OR REPLACE would
-- leave the old 4-arg signature behind as a separate (now-dead) overload —
-- drop it first. Same reasoning applies below for p_is_birthday_shake.
drop function if exists record_checkin(uuid, integer, consumption_type, date);
drop function if exists record_checkin(uuid, integer, consumption_type, date, uuid);

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
  v_nc_level customer_nc_level;
  v_points_per_cup integer;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  -- Resolves to the linked account's balance holder when this customer has
  -- been merged into another (see link_customer_to_spouse()); otherwise
  -- it's just their own id. Loyalty eligibility below is always the
  -- checking-in customer's own nc_level, not the balance holder's.
  select coalesce(linked_to_customer_id, id), nc_level into v_balance_customer_id, v_nc_level
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

  -- Loyalty Program: 10/20/30-Day customers only, only when the club has it
  -- turned on, always cups x points_per_cup so it can never drift from what
  -- was actually checked in — see correct_checkin()/void_checkin() for how
  -- this stays in sync with later edits/voids. Never blocks the check-in.
  if v_nc_level in ('10-day', '20-day', '30-day') then
    select points_per_cup into v_points_per_cup
    from loyalty_settings where nc_club_id = v_club_id and enabled;

    if found then
      insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, checkin_id, recorded_by)
      values (p_customer_id, v_club_id, p_cups * v_points_per_cup, 'checkin', v_result.id, v_coach_id);

      update customers set loyalty_points_balance = loyalty_points_balance + p_cups * v_points_per_cup
      where id = p_customer_id;
    end if;
  end if;

  return v_result;
end;
$$;

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
    nc_club_id, name, gender, contact, dob, nc_level, initial_nc_level, consumption_balance,
    invited_by_type, invited_by_coach_id, invited_by_customer_id, coach_id,
    created_by, active
  )
  values (
    v_club_id, p_name, 'Others', p_contact, null, 'Ala Carte', 'Ala Carte', 1,
    p_invited_by_type, p_invited_by_coach_id, p_invited_by_customer_id,
    -- Invited by a coach: attribute directly to that coach. Invited by a
    -- customer: inherit whichever coach that customer is under, so the
    -- walk-in still counts toward Coach's Cup instead of falling through
    -- with no coach at all. Plug-in has no coach to attribute to.
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

-- Adding p_new_is_birthday_shake changes the argument list, so CREATE OR
-- REPLACE would leave the old 4-arg signature behind as a separate
-- (now-dead) overload — drop it first.
drop function if exists correct_checkin(uuid, integer, consumption_type, text);

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
  v_ledger loyalty_points_ledger%rowtype;
  v_new_points integer;
  v_delta integer;
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

  -- Loyalty Program: if this check-in earned points, keep them in step with
  -- the new cup count — at the SAME per-cup rate that was actually applied
  -- when it was checked in, not whatever loyalty_settings says today (a
  -- later rate change must never retroactively rewrite an old check-in
  -- beyond the cup delta itself). No-op if loyalty was never active for
  -- this check-in (no ledger row to begin with).
  if v_checkin.cups is distinct from p_new_cups then
    select * into v_ledger from loyalty_points_ledger
    where checkin_id = p_checkin_id and kind = 'checkin' and not voided
    for update;

    if found then
      v_new_points := (v_ledger.points / v_checkin.cups) * p_new_cups;
      v_delta := v_new_points - v_ledger.points;

      if v_delta <> 0 then
        insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, checkin_id, reason, recorded_by)
        values (v_checkin.customer_id, v_checkin.nc_club_id, v_delta, 'adjustment', p_checkin_id, p_reason, v_editor_id);

        update customers set loyalty_points_balance = loyalty_points_balance + v_delta
        where id = v_checkin.customer_id;
      end if;
    end if;
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
  v_loyalty_total integer;
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

  -- Loyalty Program: reverse whatever this check-in currently totals in the
  -- ledger (the original 'checkin' row plus any later 'adjustment' rows
  -- from cup-count edits), same "undo everything this check-in caused" as
  -- the balance refund above.
  select coalesce(sum(points), 0) into v_loyalty_total
  from loyalty_points_ledger
  where checkin_id = p_checkin_id and not voided;

  if v_loyalty_total <> 0 then
    update loyalty_points_ledger
    set voided = true, voided_by = v_editor_id, voided_at = now(), void_reason = p_reason
    where checkin_id = p_checkin_id and not voided;

    update customers set loyalty_points_balance = loyalty_points_balance - v_loyalty_total
    where id = v_checkin.customer_id;
  end if;
end;
$$;

-- Admin-only bonus award (referral, event participation, or a custom
-- amount+reason) — mirrors renew_customer()'s shape.
create or replace function award_loyalty_points(
  p_customer_id uuid,
  p_earn_rule_id uuid default null,
  p_points integer default null,
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
  v_club_id uuid;
  v_points integer;
  v_reason text;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can award loyalty points';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_customer from customers where id = p_customer_id and nc_club_id = v_club_id and active for update;
  if not found then
    raise exception 'Customer not found in your club';
  end if;
  if v_customer.nc_level not in ('10-day', '20-day', '30-day') then
    raise exception 'Only 10-Day, 20-Day, and 30-Day customers are eligible for the loyalty program';
  end if;
  if not exists (select 1 from loyalty_settings where nc_club_id = v_club_id and enabled) then
    raise exception 'Loyalty program is not enabled for your club';
  end if;

  if p_earn_rule_id is not null then
    select points, label into v_points, v_reason
    from loyalty_earn_rules
    where id = p_earn_rule_id and nc_club_id = v_club_id and active;
    if not found then
      raise exception 'Earn rule not found';
    end if;
  else
    if p_points is null or p_points <= 0 then
      raise exception 'Points must be a positive number';
    end if;
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'A reason is required for a custom point award';
    end if;
    v_points := p_points;
    v_reason := p_reason;
  end if;

  insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, earn_rule_id, reason, recorded_by)
  values (p_customer_id, v_club_id, v_points, 'manual', p_earn_rule_id, v_reason, v_coach_id);

  update customers set loyalty_points_balance = loyalty_points_balance + v_points
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

-- Admin-only redemption — mirrors correct_customer_balance()'s validation
-- shape.
create or replace function redeem_loyalty_reward(
  p_customer_id uuid,
  p_reward_id uuid
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_customer customers%rowtype;
  v_club_id uuid;
  v_reward loyalty_rewards%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can redeem loyalty rewards';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_customer from customers where id = p_customer_id and nc_club_id = v_club_id and active for update;
  if not found then
    raise exception 'Customer not found in your club';
  end if;
  if v_customer.nc_level not in ('10-day', '20-day', '30-day') then
    raise exception 'Only 10-Day, 20-Day, and 30-Day customers are eligible for the loyalty program';
  end if;
  if not exists (select 1 from loyalty_settings where nc_club_id = v_club_id and enabled) then
    raise exception 'Loyalty program is not enabled for your club';
  end if;

  select * into v_reward from loyalty_rewards where id = p_reward_id and nc_club_id = v_club_id and active;
  if not found then
    raise exception 'Reward not found';
  end if;
  if v_customer.loyalty_points_balance < v_reward.points_cost then
    raise exception 'Not enough points to redeem this reward';
  end if;

  insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, reward_id, reason, recorded_by)
  values (p_customer_id, v_club_id, -v_reward.points_cost, 'redeem', p_reward_id, v_reward.name, v_coach_id);

  update customers set loyalty_points_balance = loyalty_points_balance - v_reward.points_cost
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

-- Admin-only undo for a mis-clicked redemption — refunds the points.
-- Deliberately scoped to kind='redeem' only; the automatic void-on-
-- checkin-void above is a separate mechanism (system-triggered, not an
-- admin action on the ledger itself).
create or replace function void_loyalty_redemption(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_entry loyalty_points_ledger%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void a redemption';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a redemption';
  end if;

  select * into v_entry from loyalty_points_ledger where id = p_entry_id for update;
  if not found then
    raise exception 'Ledger entry not found';
  end if;
  if v_entry.kind <> 'redeem' then
    raise exception 'Only a redemption can be voided this way';
  end if;
  if v_entry.voided then
    raise exception 'Already voided';
  end if;
  if v_entry.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot void a redemption outside your club';
  end if;

  update loyalty_points_ledger
  set voided = true, voided_by = v_coach_id, voided_at = now(), void_reason = p_reason
  where id = p_entry_id;

  -- v_entry.points is negative for a redemption, so subtracting it adds
  -- the points back.
  update customers set loyalty_points_balance = loyalty_points_balance - v_entry.points
  where id = v_entry.customer_id;
end;
$$;

-- Admin-only, own club — creates or updates the club's single settings row.
create or replace function upsert_loyalty_settings(p_enabled boolean, p_points_per_cup integer)
returns loyalty_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_settings loyalty_settings%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can change loyalty program settings';
  end if;
  if p_points_per_cup < 0 then
    raise exception 'Points per cup cannot be negative';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  insert into loyalty_settings (nc_club_id, enabled, points_per_cup)
  values (v_club_id, p_enabled, p_points_per_cup)
  on conflict (nc_club_id) do update
    set enabled = excluded.enabled, points_per_cup = excluded.points_per_cup
  returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function award_loyalty_points(uuid, uuid, integer, text) to authenticated;
grant execute on function redeem_loyalty_reward(uuid, uuid) to authenticated;
grant execute on function void_loyalty_redemption(uuid, text) to authenticated;
grant execute on function upsert_loyalty_settings(boolean, integer) to authenticated;

-- Adds cups to a customer's consumption balance when they renew their NC
-- card, and records the renewal for audit purposes. Admin-only, own club.
-- p_reason is only meaningful for a "Custom" renewal (see renew-dialog.tsx).
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

grant execute on function record_checkin(uuid, integer, consumption_type, date, uuid, boolean) to authenticated;
grant execute on function correct_checkin(uuid, integer, consumption_type, text, boolean) to authenticated;
grant execute on function void_checkin(uuid, text) to authenticated;
grant execute on function renew_customer(uuid, customer_nc_level, integer, text) to authenticated;
grant execute on function correct_customer_balance(uuid, integer, text) to authenticated;
grant execute on function link_customer_to_spouse(uuid, uuid) to authenticated;
grant execute on function unlink_customer(uuid) to authenticated;
grant execute on function merge_customers(uuid, uuid) to authenticated;
grant execute on function record_walkin_checkin(text, text, invited_by_type, uuid, uuid, consumption_type, date) to authenticated;
grant execute on function record_walkin_checkin_existing(uuid, consumption_type, date) to authenticated;
grant execute on function recent_walkin_customers(uuid) to authenticated;

-- =========================================================================
-- REPORTING RPCs
-- =========================================================================

-- All reporting RPCs take an optional p_club_id. When omitted, they default
-- to the caller's own club. When given, they're still authorized against
-- visible_club_ids() — a coach can only ever look at their own club or a
-- branch club whose Owner named them as sponsor (see list_branch_clubs()
-- below and the /branches page). Reports are per-club, not auto-merged
-- across branches, so numbers are always attributable to one specific club.

-- Every customer in a club whose checkins should NOT count toward any
-- coach's cup, AS OF p_as_of: their own member_type is SP/WT/AWT/TAB (and
-- was already, by p_as_of — see coach_cup_excluded_since), or ANY ancestor
-- in their invited-by chain (any number of generations back, via
-- invited_by_customer_id) already was by then. A downstream customer
-- inherits their tainted ancestor's excluded_since date, not their own —
-- the whole point is that becoming SP/WT/AWT/TAB stops counting from that
-- moment on, not retroactively. For single-date callers (daily_totals,
-- daily_coach_cups, daily_branch_coach_cups); range-aggregate callers
-- (weekly/monthly/branches) use coach_cup_exclusion_dates() below instead,
-- so they can compare per checkin_date row rather than one fixed date.
-- `union` (not `union all`) also makes the recursion safe against a cyclical
-- invited-by chain, should one ever exist — it stops once no new rows surface.
create or replace function coach_cup_excluded_customer_ids(p_as_of date, p_club_id uuid default null)
returns table (customer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_customer_id, member_type, coach_cup_excluded_since
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id, coalesce(coach_cup_excluded_since, date '1970-01-01') as excluded_since
    from club_customers
    where member_type in ('SP', 'WT', 'AWT', 'TAB')
    union
    select cc.id, t.excluded_since
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id
  from tainted
  where excluded_since <= p_as_of;
$$;

-- Range-aggregate companion to coach_cup_excluded_customer_ids() above —
-- same taint lineage, but returns each tainted customer's earliest
-- applicable excluded_since instead of testing against one fixed date, so
-- weekly/monthly/branches callers can compare it per checkin_date row (a
-- customer's cups from before that date still count, only cups from that
-- date on stop).
create or replace function coach_cup_exclusion_dates(p_club_id uuid default null)
returns table (customer_id uuid, excluded_since date)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_customer_id, member_type, coach_cup_excluded_since
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id, coalesce(coach_cup_excluded_since, date '1970-01-01') as excluded_since
    from club_customers
    where member_type in ('SP', 'WT', 'AWT', 'TAB')
    union all
    select cc.id, t.excluded_since
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id, min(excluded_since) as excluded_since
  from tainted
  group by id;
$$;

-- Every customer who traces back — through any number of customer-to-customer
-- generations via invited_by_customer_id — to a root customer whose own
-- invited_by_type is 'plugin', plus that root itself. "Plug-in Cups" credits
-- every generation of a Plug-in-originated chain, not just the customer
-- Plug-in invited directly. A chain stops the moment someone was invited by
-- a coach instead of a customer (invited_by_customer_id is null there), so
-- it never crosses into an unrelated coach-invited lineage.
create or replace function plugin_lineage_customer_ids(p_club_id uuid default null)
returns table (customer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_type, invited_by_customer_id
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id from club_customers where invited_by_type = 'plugin'
    union
    select cc.id
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id from tainted;
$$;

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (
  total_cups bigint,
  plugin_cups bigint,
  coach_cup_total bigint,
  dine_in_cups bigint,
  takeaway_cups bigint,
  consumption_vp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (
      where cu.id in (select customer_id from plugin_lineage_customer_ids(p_club_id))
    ), 0) as plugin_cups,
    -- Mirrors the daily_coach_cups() eligibility rule (coach assigned, not in
    -- coach_cup_excluded_customer_ids), summed across every coach for this
    -- club/date.
    coalesce(sum(ci.cups) filter (
      where cu.coach_id is not null
        and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_date, p_club_id))
    ), 0) as coach_cup_total,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Dine-in'), 0) as dine_in_cups,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Take-away'), 0) as takeaway_cups,
    -- Same definition as branches_daily_summary's consumption_vp: stock-out
    -- with no customer_id (team's own consumption, not a sale/loan).
    coalesce((
      select sum(t.quantity * p.vp)
      from inventory_transactions t
      join products p on p.id = t.product_id
      where t.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
        and t.direction = 'out'
        and not t.voided
        and t.customer_id is null
        and t.txn_date = p_date
    ), 0) as consumption_vp
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

-- "Coach's Cup" is grouped by the customer's assigned coach_id (separate
-- from invited_by — a customer can be invited by another customer or
-- Plug-in and still be "under" a coach for cup attribution). Counts any
-- customer with a coach assigned, EXCEPT those in
-- coach_cup_excluded_customer_ids (own or an ancestor's member type is
-- SP/WT/AWT/TAB). Restricted to coaches registered under the club being
-- viewed — a customer's "Coach" field can point to a coach registered at a
-- different club (e.g. they invited this customer before they moved, or the
-- customer now walks into a different branch), and those show up in
-- daily_branch_coach_cups() instead.
create or replace function daily_coach_cups(p_date date, p_club_id uuid default null)
returns table (coach_id uuid, coach_name text, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.coach_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_date, p_club_id))
    and co.nc_club_id = ci.nc_club_id
  group by co.id, co.name
  order by cups desc;
$$;

-- Companion to daily_coach_cups(): coaches registered under a DIFFERENT club
-- than the one being viewed, who still have cups today because a customer's
-- "Coach" field points to them. Shown in its own "Branches Coach's Cup"
-- section so a club's own Coach's Cup table isn't mixed with other clubs'
-- coaches.
create or replace function daily_branch_coach_cups(p_date date, p_club_id uuid default null)
returns table (coach_id uuid, coach_name text, coach_club_name text, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    co.id as coach_id,
    co.name as coach_name,
    ncc.name as coach_club_name,
    coalesce(sum(ci.cups), 0) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.coach_id
  left join nc_clubs ncc on ncc.id = co.nc_club_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_date, p_club_id))
    and co.nc_club_id is distinct from ci.nc_club_id
  group by co.id, co.name, ncc.name
  order by cups desc;
$$;

-- The club's best single day ever (any day strictly before p_date, so
-- "today" — still climbing — is never compared against itself). Powers the
-- "new club record" celebration on the Daily Report.
create or replace function club_all_time_high_cups(p_club_id uuid default null, p_date date default current_date)
returns table (record_date date, total_cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select checkin_date, sum(cups) as total_cups
  from checkins
  where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and nc_club_id in (select visible_club_ids(current_coach_id()))
    and not voided
    and checkin_date < p_date
  group by checkin_date
  order by total_cups desc, checkin_date desc
  limit 1;
$$;

-- Same idea as club_all_time_high_cups(), but one coach's own best single
-- day for their personal Coach's Cup — same date-aware exclusion rule as
-- daily_coach_cups(), just evaluated per historical day instead of one.
create or replace function coach_all_time_high_cups(p_coach_id uuid, p_club_id uuid default null, p_date date default current_date)
returns table (record_date date, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  )
  select ci.checkin_date, sum(ci.cups) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where cu.coach_id = p_coach_id
    and ci.nc_club_id = (select id from target_club)
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and not ci.voided
    and ci.checkin_date < p_date
    and not exists (
      select 1 from excl e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
    )
  group by ci.checkin_date
  order by cups desc, ci.checkin_date desc
  limit 1;
$$;

-- ASSUMPTION: "next 3 days" birthdays are relative to real today, independent
-- of whatever date is selected on the Daily Report page. Feb 29 birthdays in
-- a non-leap upcoming year are skipped rather than shifted. Includes shared
-- family members (customer_members) alongside primary customers — the
-- returned customer_id is the family member's own id in that case (it's only
-- used as a row key/display source here, never joined against `customers`).
create or replace function upcoming_birthdays(p_club_id uuid default null)
returns table (customer_id uuid, name text, dob date, days_until int)
language sql
stable
security definer
set search_path = public
as $$
  with next_bday as (
    select
      cu.id as customer_id,
      cu.name,
      cu.dob,
      (
        make_date(
          extract(year from current_date)::int +
            case when to_char(cu.dob, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
          extract(month from cu.dob)::int,
          extract(day from cu.dob)::int
        ) - current_date
      )::int as days_until
    from customers cu
    where cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.dob is not null
      and not (extract(month from cu.dob) = 2 and extract(day from cu.dob) = 29)
    union all
    select
      cm.id as customer_id,
      cm.name,
      cm.dob,
      (
        make_date(
          extract(year from current_date)::int +
            case when to_char(cm.dob, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
          extract(month from cm.dob)::int,
          extract(day from cm.dob)::int
        ) - current_date
      )::int as days_until
    from customer_members cm
    join customers cu on cu.id = cm.customer_id
    where cm.active
      and cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cm.dob is not null
      and not (extract(month from cm.dob) = 2 and extract(day from cm.dob) = 29)
  )
  select * from next_bday where days_until between 0 and 3 order by days_until;
$$;

-- ASSUMPTION: "Average NC Cups" / "Average Coach Cups" for a month = total
-- cups / OPERATING days (distinct calendar days with at least one
-- non-voided check-in), not calendar days elapsed. A day the club didn't
-- open (no check-ins at all) doesn't drag the average down. days_in_period
-- now means "operating days" though the column name is unchanged.
create or replace function monthly_totals(p_month date, p_club_id uuid default null)
returns table (total_cups bigint, days_in_period int, avg_daily_cups numeric)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  club_checkins as (
    select ci.cups, ci.checkin_date
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  operating_days as (
    select count(distinct checkin_date) as n from club_checkins
  )
  select
    coalesce(sum(cups), 0) as total_cups,
    coalesce((select n from operating_days), 0) as days_in_period,
    round(coalesce(sum(cups), 0)::numeric / nullif((select n from operating_days), 0), 2) as avg_daily_cups
  from club_checkins;
$$;

create or replace function monthly_coach_cups(p_month date, p_club_id uuid default null)
returns table (coach_id uuid, coach_name text, total_cups bigint, avg_daily_cups numeric)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  club_checkins as (
    select ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  -- Operating days are based on all of the club's check-in activity that
  -- month, not just the subset that counts toward a coach's cup.
  operating_days as (
    select count(distinct checkin_date) as n from club_checkins
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(cc.cups), 0) as total_cups,
    round(coalesce(sum(cc.cups), 0)::numeric / nullif((select n from operating_days), 0), 2) as avg_daily_cups
  from club_checkins cc
  join customers cu on cu.id = cc.customer_id
  join coaches co on co.id = cu.coach_id
  where not exists (
    select 1 from excl e where e.customer_id = cu.id and cc.checkin_date >= e.excluded_since
  )
  group by co.id, co.name
  order by total_cups desc;
$$;

-- Tracks new sign-ups and renewals per NC package level, for NC Metrics'
-- "New 5-Day Trial" / "10-Day" / "20-Day" / "30-Day" sections. 5-day is a
-- one-time trial (ASSUMPTION: never renewed, so only "new" rows appear for
-- it) — 10/20/30-day include both new sign-ups at that level and renewals
-- to that level. Both are attributed to the customer's CURRENT assigned
-- coach_id (same attribution as Coach's Cup), not whichever coach happened
-- to record the renewal. A customer with no assigned coach still counts
-- toward the total, grouped under a null coach_id/coach_name (client
-- displays this as "Unassigned").
-- Adds invited_by_type, which CREATE OR REPLACE can't do (return-column
-- change) — drop the old 7-column version first.
drop function if exists monthly_package_sales(date, uuid);

create or replace function monthly_package_sales(p_month date, p_club_id uuid default null)
returns table (
  nc_level text,
  coach_id uuid,
  coach_name text,
  customer_id uuid,
  customer_name text,
  entry_date date,
  kind text,
  invited_by_type text
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  new_customers as (
    select
      cu.initial_nc_level::text as nc_level,
      cu.coach_id,
      co.name as coach_name,
      cu.id as customer_id,
      cu.name as customer_name,
      cu.created_at::date as entry_date,
      'new' as kind,
      cu.invited_by_type::text as invited_by_type
    from customers cu
    left join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id = (select id from target_club)
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between b.month_start and b.month_end
  ),
  renewals as (
    select
      cr.nc_level::text as nc_level,
      cu.coach_id,
      co.name as coach_name,
      cu.id as customer_id,
      cu.name as customer_name,
      cr.created_at::date as entry_date,
      'renewed' as kind,
      cu.invited_by_type::text as invited_by_type
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    left join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id = (select id from target_club)
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between b.month_start and b.month_end
  )
  select * from new_customers
  union all
  select * from renewals
  order by nc_level, coach_name nulls last, entry_date;
$$;

-- Per-day breakdown behind the Monthly Report's Daily Operations page —
-- same columns as daily_totals() (minus coach_cup_total, which
-- monthly_coach_cups_by_day() below covers per coach), generalized from one
-- day to every operating day in the month.
create or replace function monthly_daily_breakdown(p_month date, p_club_id uuid default null)
returns table (
  checkin_date date,
  total_cups bigint,
  dine_in_cups bigint,
  takeaway_cups bigint,
  plugin_cups bigint,
  consumption_vp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  club_checkins as (
    select ci.checkin_date, ci.cups, ci.consumption_type, cu.id as customer_id
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  cup_totals as (
    select
      checkin_date,
      coalesce(sum(cups), 0) as total_cups,
      coalesce(sum(cups) filter (where consumption_type = 'Dine-in'), 0) as dine_in_cups,
      coalesce(sum(cups) filter (where consumption_type = 'Take-away'), 0) as takeaway_cups,
      coalesce(sum(cups) filter (
        where customer_id in (select customer_id from plugin_lineage_customer_ids((select id from target_club)))
      ), 0) as plugin_cups
    from club_checkins
    group by checkin_date
  ),
  inv_out as (
    select t.txn_date, sum(t.quantity * p.vp) as consumption_vp
    from inventory_transactions t
    join products p on p.id = t.product_id
    cross join bounds b
    where t.nc_club_id = (select id from target_club)
      and t.direction = 'out'
      and not t.voided
      and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
    group by t.txn_date
  )
  select
    ct.checkin_date,
    ct.total_cups,
    ct.dine_in_cups,
    ct.takeaway_cups,
    ct.plugin_cups,
    coalesce(io.consumption_vp, 0) as consumption_vp
  from cup_totals ct
  left join inv_out io on io.txn_date = ct.checkin_date
  order by ct.checkin_date;
$$;

-- Per-day, per-coach matrix behind the Monthly Report's Coach's Cup page —
-- same eligibility rule as monthly_coach_cups() (which this is a day-level
-- companion to: same total_cups per coach), just also keyed by day. A coach
-- with no eligible check-ins that month doesn't appear, same reasoning as
-- branches_coach_cup_records().
create or replace function monthly_coach_cups_by_day(p_month date, p_club_id uuid default null)
returns table (
  coach_id uuid,
  coach_name text,
  total_cups bigint,
  daily jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  club_checkins as (
    select ci.checkin_date, ci.cups, cu.coach_id
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.coach_id is not null
      and not exists (
        select 1 from excl e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
      )
  ),
  per_day as (
    select coach_id, checkin_date, sum(cups) as cups
    from club_checkins
    group by coach_id, checkin_date
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(pd.cups), 0) as total_cups,
    jsonb_object_agg(pd.checkin_date::text, pd.cups) as daily
  from per_day pd
  join coaches co on co.id = pd.coach_id
  group by co.id, co.name
  order by total_cups desc;
$$;

-- Best and worst single days of the month (total cups), plus the month's
-- best single coach-day — behind the Monthly Report's "Records this month"
-- highlight cards. Same ranking idiom as branches_cup_records()/
-- branches_coach_cup_records(), just bounded to one month/club instead of
-- all history/all branches. Returns one row regardless of data (nulls if
-- the club had no operating days that month).
create or replace function monthly_cup_records(p_month date, p_club_id uuid default null)
returns table (
  highest_date date,
  highest_cups bigint,
  lowest_date date,
  lowest_cups bigint,
  best_coach_id uuid,
  best_coach_name text,
  best_coach_date date,
  best_coach_cups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  daily as (
    select ci.checkin_date, sum(ci.cups) as total_cups
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    group by ci.checkin_date
  ),
  ranked_high as (
    select checkin_date, total_cups, row_number() over (order by total_cups desc, checkin_date desc) as rn
    from daily
  ),
  ranked_low as (
    select checkin_date, total_cups, row_number() over (order by total_cups asc, checkin_date desc) as rn
    from daily
  ),
  excl as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  coach_daily as (
    select cu.coach_id, ci.checkin_date, sum(ci.cups) as cups
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id = (select id from target_club)
      and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.coach_id is not null
      and not exists (
        select 1 from excl e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
      )
    group by cu.coach_id, ci.checkin_date
  ),
  ranked_coach as (
    select coach_id, checkin_date, cups, row_number() over (order by cups desc, checkin_date desc) as rn
    from coach_daily
  )
  select
    (select checkin_date from ranked_high where rn = 1),
    (select total_cups from ranked_high where rn = 1),
    (select checkin_date from ranked_low where rn = 1),
    (select total_cups from ranked_low where rn = 1),
    (select coach_id from ranked_coach where rn = 1),
    (select co.name from ranked_coach rc join coaches co on co.id = rc.coach_id where rc.rn = 1),
    (select checkin_date from ranked_coach where rn = 1),
    (select cups from ranked_coach where rn = 1);
$$;

-- Opening/restocked/consumed/sold/closing per product for the Monthly
-- Report's Inventory page. "Consumed" mirrors monthly_inventory_out() (a
-- stock-out with no customer_id — the team's own use); "sold" is the other
-- half of stock-outs (a sale/loan to a customer), kept separate so neither
-- silently swallows the other. There's no low-stock threshold anywhere in
-- the schema, so this deliberately doesn't flag one — closing_balance is
-- the plain number, same as inventory_stock_levels() shows today.
create or replace function monthly_inventory_report(p_month date, p_club_id uuid default null)
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  opening_balance bigint,
  restocked_qty bigint,
  consumed_qty bigint,
  sold_qty bigint,
  closing_balance bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  opening as (
    select
      p.id as product_id,
      coalesce(sum(
        case when t.direction = 'in' then t.quantity
             when t.direction = 'out' then -t.quantity
             else 0 end
      ), 0) as balance
    from products p
    left join inventory_transactions t
      on t.product_id = p.id
      and t.nc_club_id = (select id from target_club)
      and not t.voided
      and t.txn_date < (select month_start from bounds)
    where p.active
    group by p.id
  ),
  month_txns as (
    select t.product_id, t.direction, t.quantity, t.customer_id
    from inventory_transactions t
    cross join bounds b
    where t.nc_club_id = (select id from target_club)
      and not t.voided
      and t.txn_date between b.month_start and b.month_end
  ),
  month_totals as (
    select
      product_id,
      coalesce(sum(quantity) filter (where direction = 'in'), 0) as restocked_qty,
      coalesce(sum(quantity) filter (where direction = 'out' and customer_id is null), 0) as consumed_qty,
      coalesce(sum(quantity) filter (where direction = 'out' and customer_id is not null), 0) as sold_qty
    from month_txns
    group by product_id
  )
  select
    p.id,
    p.name,
    p.vp,
    o.balance as opening_balance,
    coalesce(mt.restocked_qty, 0) as restocked_qty,
    coalesce(mt.consumed_qty, 0) as consumed_qty,
    coalesce(mt.sold_qty, 0) as sold_qty,
    o.balance + coalesce(mt.restocked_qty, 0) - coalesce(mt.consumed_qty, 0) - coalesce(mt.sold_qty, 0) as closing_balance
  from products p
  join opening o on o.product_id = p.id
  left join month_totals mt on mt.product_id = p.id
  where p.active
  order by p.name;
$$;

-- Powers the "Weekly" tab on /reports/metrics — same "last 6 operating days"
-- window as the Branches Weekly tab, but scoped to a single club (default:
-- caller's own) instead of every visible branch. Mirrors
-- branches_weekly_summary's CTEs; coach attribution is always the
-- customer's assigned coach_id, same as Coach's Cup.
create or replace function weekly_totals(p_date date default current_date, p_club_id uuid default null)
returns table (
  operating_days int,
  window_start date,
  window_end date,
  total_cups bigint,
  coach_cup_total bigint,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint,
  daily jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  window_days as (
    select checkin_date from ranked_days where rn <= 6
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from window_days
  ),
  excluded as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  cup_totals as (
    select
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = (select id from target_club) and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
  ),
  inv_totals as (
    select coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from windows w
    left join inventory_transactions t
      on t.nc_club_id = (select id from target_club) and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between w.window_start and w.window_end
    left join products p on p.id = t.product_id
  ),
  daily_cup_totals as (
    select
      wd.checkin_date,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = (select id from target_club) and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.checkin_date
  ),
  daily_json as (
    select jsonb_agg(
      jsonb_build_object('date', checkin_date, 'total_cups', total_cups, 'coach_cup_total', coach_cup_total)
      order by checkin_date
    ) as daily
    from daily_cup_totals
  ),
  new_signups as (
    select cu.initial_nc_level as nc_level, count(*) as n
    from customers cu
    cross join windows w
    where cu.nc_club_id = (select id from target_club)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between w.window_start and w.window_end
    group by cu.initial_nc_level
  ),
  renewals as (
    select cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join windows w
    where cu.nc_club_id = (select id from target_club)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between w.window_start and w.window_end
    group by cr.nc_level
  )
  select
    coalesce(w.operating_days, 0),
    w.window_start,
    w.window_end,
    coalesce(ct.total_cups, 0),
    coalesce(ct.coach_cup_total, 0),
    coalesce(it.consumption_vp, 0),
    coalesce((select n from new_signups where nc_level = '5-day'), 0),
    coalesce((select n from new_signups where nc_level = '10-day'), 0)
      + coalesce((select n from renewals where nc_level = '10-day'), 0),
    coalesce((select n from new_signups where nc_level = '20-day'), 0)
      + coalesce((select n from renewals where nc_level = '20-day'), 0),
    coalesce((select n from new_signups where nc_level = '30-day'), 0)
      + coalesce((select n from renewals where nc_level = '30-day'), 0),
    coalesce(dj.daily, '[]'::jsonb)
  from windows w
  left join cup_totals ct on true
  left join inv_totals it on true
  left join daily_json dj on true;
$$;

-- Per-customer detail behind weekly_totals' New 5-Day / 10-Day / 20-Day /
-- 30-Day counts, same shape as branches_weekly_new_renewals but for one club.
create or replace function weekly_new_renewals(p_date date default current_date, p_club_id uuid default null)
returns table (
  nc_level customer_nc_level,
  kind text,
  customer_name text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end
    from ranked_days
    where rn <= 6
  )
  select
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  cross join windows w
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id = (select id from target_club)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between w.window_start and w.window_end

  union all

  select
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  cross join windows w
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id = (select id from target_club)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between w.window_start and w.window_end

  order by nc_level, created_at desc;
$$;

-- Every customer who checked in during the same 6-operating-day window,
-- with how many CUPS (not check-in events) each day — powers the Weekly
-- tab's attendance list so a coach meeting can spot who's coming in often
-- vs. barely showing up. Was previously counting check-in rows (count(*)),
-- which happened to equal cups for a 1-cup-per-visit customer but silently
-- undercounted anyone who checks in once for 2 cups — sum(ci.cups) instead.
-- Renaming visit_count to total_cups to match what it now holds is itself
-- a return-column change, which CREATE OR REPLACE can't do — drop first.
drop function if exists weekly_customer_attendance(date, uuid);

create or replace function weekly_customer_attendance(p_date date default current_date, p_club_id uuid default null)
returns table (
  customer_id uuid,
  customer_name text,
  coach_name text,
  nc_level customer_nc_level,
  total_cups bigint,
  daily jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end
    from ranked_days
    where rn <= 6
  ),
  per_day as (
    select ci.customer_id, ci.checkin_date, sum(ci.cups) as n
    from checkins ci
    cross join windows w
    where ci.nc_club_id = (select id from target_club)
      and not ci.voided
      and ci.checkin_date between w.window_start and w.window_end
    group by ci.customer_id, ci.checkin_date
  )
  select
    cu.id as customer_id,
    cu.name as customer_name,
    co.name as coach_name,
    cu.nc_level,
    sum(pd.n) as total_cups,
    jsonb_object_agg(pd.checkin_date::text, pd.n) as daily
  from per_day pd
  join customers cu on cu.id = pd.customer_id
  left join coaches co on co.id = cu.coach_id
  group by cu.id, cu.name, co.name, cu.nc_level
  order by total_cups desc, cu.name;
$$;

-- Per-coach breakdown behind weekly_totals' Coach's Cup figure — same
-- window, same coach_cup_excluded_customer_ids eligibility rule, just
-- sliced per coach instead of summed across the whole club. Average is per
-- operating day in the window (not per day the coach personally worked),
-- matching how coach_cup_total / operating_days is presented elsewhere.
create or replace function weekly_coach_cup_by_coach(p_date date default current_date, p_club_id uuid default null)
returns table (
  coach_id uuid,
  coach_name text,
  total_cups bigint,
  avg_cups_per_day numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from ranked_days
    where rn <= 6
  ),
  excluded as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as total_cups,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif(w.operating_days, 0), 2) as avg_cups_per_day
  from coaches co
  cross join windows w
  join customers cu on cu.coach_id = co.id
  join checkins ci
    on ci.customer_id = cu.id and ci.nc_club_id = (select id from target_club) and not ci.voided
    and ci.checkin_date between w.window_start and w.window_end
  where co.nc_club_id = (select id from target_club)
    and not exists (
      select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
    )
  group by co.id, co.name, w.operating_days
  having coalesce(sum(ci.cups), 0) > 0
  order by avg_cups_per_day desc;
$$;

-- Downline branch clubs: any club whose Owner traces back to the caller
-- through the sponsor chain, excluding the caller's own club. Powers the
-- /branches page — clicking one opens that club's Daily Report / NC Metrics
-- on its own, never merged with the caller's own numbers.
create or replace function list_branch_clubs()
returns table (club_id uuid, club_name text)
language sql
stable
security definer
set search_path = public
as $$
  select nc.id as club_id, nc.name as club_name
  from nc_clubs nc
  where nc.id in (select visible_club_ids(current_coach_id()))
    and nc.id <> (select nc_club_id from coaches where auth_user_id = auth.uid())
  order by nc.name;
$$;

-- One-row-per-branch snapshot for a single day, so the /branches page can
-- show every branch's numbers at a glance without clicking into each one.
-- Same definitions as daily_totals/daily_coach_cups/monthly_package_sales,
-- just pre-aggregated per club instead of per coach.
-- Includes the caller's own club alongside sponsored branches (unlike
-- list_branch_clubs(), which is branch-only) — the /branches page wants a
-- single at-a-glance view across everything, own club included. Every
-- metric is also compared against each club's own previous OPERATING day
-- (the most recent earlier date with any non-voided checkin — not
-- necessarily calendar-yesterday, since a club might not open every day).
--
-- Adds prev_* columns and prev_date, which CREATE OR REPLACE can't do —
-- drop the old 8-column version first.
drop function if exists branches_daily_summary(date);

create or replace function branches_daily_summary(p_date date)
returns table (
  club_id uuid,
  club_name text,
  total_cups bigint,
  prev_total_cups bigint,
  coach_cup_total bigint,
  prev_coach_cup_total bigint,
  consumption_vp numeric,
  prev_consumption_vp numeric,
  new_5day bigint,
  prev_new_5day bigint,
  total_10day bigint,
  prev_total_10day bigint,
  total_20day bigint,
  prev_total_20day bigint,
  total_30day bigint,
  prev_total_30day bigint,
  prev_date date
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  prev_days as (
    select mc.club_id, max(ci.checkin_date) as prev_date
    from my_clubs mc
    left join checkins ci
      on ci.nc_club_id = mc.club_id and ci.checkin_date < p_date and not ci.voided
    group by mc.club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      mc.club_id,
      coalesce(sum(ci.cups) filter (where ci.checkin_date = p_date), 0) as total_cups,
      coalesce(sum(ci.cups) filter (where ci.checkin_date = pd.prev_date), 0) as prev_total_cups,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = p_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = mc.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = pd.prev_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = mc.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as prev_coach_cup_total
    from my_clubs mc
    left join prev_days pd on pd.club_id = mc.club_id
    left join checkins ci
      on ci.nc_club_id = mc.club_id and not ci.voided
      and (ci.checkin_date = p_date or ci.checkin_date = pd.prev_date)
    left join customers cu on cu.id = ci.customer_id
    group by mc.club_id
  ),
  inv_totals as (
    select
      mc.club_id,
      coalesce(sum(t.quantity * p.vp) filter (where t.txn_date = p_date), 0) as consumption_vp,
      coalesce(sum(t.quantity * p.vp) filter (where t.txn_date = pd.prev_date), 0) as prev_consumption_vp
    from my_clubs mc
    left join prev_days pd on pd.club_id = mc.club_id
    left join inventory_transactions t
      on t.nc_club_id = mc.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and (t.txn_date = p_date or t.txn_date = pd.prev_date)
    left join products p on p.id = t.product_id
    group by mc.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.initial_nc_level as nc_level, cu.created_at::date as d, count(*) as n
    from customers cu
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    group by cu.nc_club_id, cu.initial_nc_level, cu.created_at::date
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, cr.created_at::date as d, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
    group by cu.nc_club_id, cr.nc_level, cr.created_at::date
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.prev_total_cups, 0) as prev_total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce(ct.prev_coach_cup_total, 0) as prev_coach_cup_total,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce(it.prev_consumption_vp, 0) as prev_consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day' and ns.d = p_date), 0) as new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day' and ns.d = pd.prev_date), 0) as prev_new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day' and r.d = p_date), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day' and r.d = pd.prev_date), 0) as prev_total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day' and r.d = p_date), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day' and r.d = pd.prev_date), 0) as prev_total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day' and r.d = p_date), 0) as total_30day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day' and r.d = pd.prev_date), 0) as prev_total_30day,
    pd.prev_date
  from my_clubs mc
  left join prev_days pd on pd.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  -- Own club first, then branches ranked by today's Total Cups (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

-- Daily report log entries ("what happened today") across every visible
-- branch club for one day — feeds the list under each club card on the
-- Branches Daily tab.
create or replace function branches_daily_remarks(p_date date)
returns table (
  club_id uuid,
  note text,
  created_by_coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.nc_club_id as club_id, l.note, co.name as created_by_coach_name, l.created_at
  from daily_report_logs l
  left join coaches co on co.id = l.created_by_coach_id
  where l.nc_club_id in (select visible_club_ids(current_coach_id()))
    and l.log_date = p_date
  order by l.created_at desc;
$$;

-- Weekly per-club rollup for the Branches "Weekly" tab: own club + every
-- sponsored branch, own club first. Each club's window is its OWN most
-- recent 6 distinct operating days (dates with a non-voided checkin) up to
-- and including p_date — not a fixed 6 calendar days, so a club that was
-- closed some days still gets 6 full days of activity. New/renewed package
-- counts use the calendar range spanning those 6 operating days (signups
-- aren't tied to checkin dates the way cups are).
create or replace function branches_weekly_summary(p_date date default current_date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  window_start date,
  window_end date,
  total_cups bigint,
  coach_cup_total bigint,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint,
  daily jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  ranked_days as (
    select
      ci.nc_club_id as club_id,
      ci.checkin_date,
      row_number() over (partition by ci.nc_club_id order by ci.checkin_date desc) as rn
    from (
      select distinct nc_club_id, checkin_date
      from checkins
      where not voided and checkin_date <= p_date
    ) ci
    where ci.nc_club_id in (select club_id from my_clubs)
  ),
  window_days as (
    select club_id, checkin_date
    from ranked_days
    where rn <= 6
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from window_days
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      wd.club_id,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = wd.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = wd.club_id and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.club_id
  ),
  inv_totals as (
    select
      w.club_id,
      coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from windows w
    left join inventory_transactions t
      on t.nc_club_id = w.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between w.window_start and w.window_end
    left join products p on p.id = t.product_id
    group by w.club_id
  ),
  daily_cup_totals as (
    select
      wd.club_id,
      wd.checkin_date,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = wd.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = wd.club_id and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.club_id, wd.checkin_date
  ),
  daily_json as (
    select
      club_id,
      jsonb_agg(
        jsonb_build_object(
          'date', checkin_date,
          'total_cups', total_cups,
          'coach_cup_total', coach_cup_total
        )
        order by checkin_date
      ) as daily
    from daily_cup_totals
    group by club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.initial_nc_level as nc_level, count(*) as n
    from customers cu
    join windows w on w.club_id = cu.nc_club_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between w.window_start and w.window_end
    group by cu.nc_club_id, cu.initial_nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    join windows w on w.club_id = cu.nc_club_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between w.window_start and w.window_end
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(w.operating_days, 0) as operating_days,
    w.window_start,
    w.window_end,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day,
    coalesce(dj.daily, '[]'::jsonb) as daily
  from my_clubs mc
  left join windows w on w.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  left join daily_json dj on dj.club_id = mc.club_id
  -- Own club first, then branches ranked by Total Cups over the window
  -- (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

-- Per-customer detail behind the New 5-Day / 10-Day / 20-Day / 30-Day stats
-- on the Branches "Weekly" tab — mirrors the new_signups/renewals CTEs
-- inside branches_weekly_summary above (same per-club "last 6 operating
-- days" window), so the list always matches that number.
create or replace function branches_weekly_new_renewals(p_date date default current_date)
returns table (
  club_id uuid,
  nc_level customer_nc_level,
  kind text,
  customer_name text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  ranked_days as (
    select
      ci.nc_club_id as club_id,
      ci.checkin_date,
      row_number() over (partition by ci.nc_club_id order by ci.checkin_date desc) as rn
    from (
      select distinct nc_club_id, checkin_date
      from checkins
      where not voided and checkin_date <= p_date
    ) ci
    where ci.nc_club_id in (select club_id from my_clubs)
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end
    from ranked_days
    where rn <= 6
    group by club_id
  )
  select
    cu.nc_club_id as club_id,
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  join windows w on w.club_id = cu.nc_club_id
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between w.window_start and w.window_end

  union all

  select
    cu.nc_club_id as club_id,
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  join windows w on w.club_id = cu.nc_club_id
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between w.window_start and w.window_end

  order by club_id, nc_level, created_at desc;
$$;

-- Per-coach average Coach's Cup over each branch's own last-6-operating-days
-- window — powers the Coach's Cup drill-down under the Branches "Weekly"
-- tab. Same window CTEs as branches_weekly_summary and the same per-coach
-- averaging as weekly_coach_cup_by_coach, just sliced across every visible
-- branch in one call instead of one club at a time.
create or replace function branches_weekly_coach_cups(p_date date default current_date)
returns table (
  club_id uuid,
  coach_id uuid,
  coach_name text,
  total_cups bigint,
  avg_cups_per_day numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  ranked_days as (
    select
      ci.nc_club_id as club_id,
      ci.checkin_date,
      row_number() over (partition by ci.nc_club_id order by ci.checkin_date desc) as rn
    from (
      select distinct nc_club_id, checkin_date
      from checkins
      where not voided and checkin_date <= p_date
    ) ci
    where ci.nc_club_id in (select club_id from my_clubs)
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from ranked_days
    where rn <= 6
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  )
  select
    co.nc_club_id as club_id,
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as total_cups,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif(w.operating_days, 0), 2) as avg_cups_per_day
  from coaches co
  join windows w on w.club_id = co.nc_club_id
  join customers cu on cu.coach_id = co.id
  join checkins ci
    on ci.customer_id = cu.id and ci.nc_club_id = co.nc_club_id and not ci.voided
    and ci.checkin_date between w.window_start and w.window_end
  where co.nc_club_id in (select club_id from my_clubs)
    and not exists (
      select 1 from excluded_per_club ec
      where ec.club_id = co.nc_club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
    )
  group by co.nc_club_id, co.id, co.name, w.operating_days
  having coalesce(sum(ci.cups), 0) > 0
  order by co.nc_club_id, avg_cups_per_day desc;
$$;

-- Per-coach Coach's Cup breakdown per club, today vs. that club's previous
-- operating day — powers the expandable per-coach list under each branch
-- card on /branches. Same eligibility rule as coach_cup_excluded_customer_ids.
create or replace function branches_coach_cups_compare(p_date date)
returns table (
  club_id uuid,
  coach_id uuid,
  coach_name text,
  cups bigint,
  prev_cups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  prev_days as (
    select mc.club_id, max(ci.checkin_date) as prev_date
    from my_clubs mc
    left join checkins ci
      on ci.nc_club_id = mc.club_id and ci.checkin_date < p_date and not ci.voided
    group by mc.club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  )
  select
    ci.nc_club_id as club_id,
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups) filter (where ci.checkin_date = p_date), 0) as cups,
    coalesce(sum(ci.cups) filter (where ci.checkin_date = pd.prev_date), 0) as prev_cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.coach_id
  join prev_days pd on pd.club_id = ci.nc_club_id
  where ci.nc_club_id in (select club_id from my_clubs)
    and not ci.voided
    and (ci.checkin_date = p_date or ci.checkin_date = pd.prev_date)
    and not exists (
      select 1 from excluded_per_club ec
      where ec.club_id = ci.nc_club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
    )
  group by ci.nc_club_id, co.id, co.name
  order by ci.nc_club_id, cups desc;
$$;

-- Per-customer detail behind the New 5-Day / 10-Day / 20-Day / 30-Day stats
-- on /branches — same counting rules as the new_signups/renewals CTEs inside
-- branches_daily_summary above, so the list here always matches that number.
create or replace function branches_new_renewals(p_date date)
returns table (
  club_id uuid,
  nc_level customer_nc_level,
  kind text,
  customer_name text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  )
  select
    cu.nc_club_id as club_id,
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date = p_date

  union all

  select
    cu.nc_club_id as club_id,
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date = p_date

  order by club_id, nc_level, created_at desc;
$$;

-- Monthly per-club snapshot for the Branches "Monthly" tab: own club + every
-- sponsored branch, own club first. avg_daily_cups / coach_cup_avg_daily are
-- both averaged over that club's own operating days that month (days with
-- at least one non-voided checkin), same denominator as monthly_totals().
create or replace function branches_monthly_summary(p_month date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  avg_daily_cups numeric,
  coach_cup_avg_daily numeric,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  club_checkins as (
    select ci.nc_club_id as club_id, ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id in (select club_id from my_clubs)
  ),
  operating_days as (
    select club_id, count(distinct checkin_date) as n
    from club_checkins
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      cc.club_id,
      coalesce(sum(cc.cups), 0) as total_cups,
      coalesce(sum(cc.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = cc.club_id and ec.customer_id = cu.id and cc.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total
    from club_checkins cc
    join customers cu on cu.id = cc.customer_id
    group by cc.club_id
  ),
  inv_totals as (
    select
      mc.club_id,
      coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from my_clubs mc
    cross join bounds b
    left join inventory_transactions t
      on t.nc_club_id = mc.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
    left join products p on p.id = t.product_id
    group by mc.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.initial_nc_level as nc_level, count(*) as n
    from customers cu
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between b.month_start and b.month_end
    group by cu.nc_club_id, cu.initial_nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between b.month_start and b.month_end
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(od.n, 0) as operating_days,
    round(coalesce(ct.total_cups, 0)::numeric / nullif(od.n, 0), 2) as avg_daily_cups,
    round(coalesce(ct.coach_cup_total, 0)::numeric / nullif(od.n, 0), 2) as coach_cup_avg_daily,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day
  from my_clubs mc
  left join operating_days od on od.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  -- Own club first, then branches ranked by this month's Avg Cups / Day
  -- (highest first) — clubs with no operating days yet sort to the end.
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    round(coalesce(ct.total_cups, 0)::numeric / nullif(od.n, 0), 2) desc nulls last,
    mc.club_name;
$$;

-- Per-customer detail behind the New 5-Day / 10-Day / 20-Day / 30-Day stats
-- on the Branches "Monthly" tab — mirrors the new_signups/renewals CTEs
-- inside branches_monthly_summary above (same calendar-month bounds), so
-- the list always matches that number.
create or replace function branches_monthly_new_renewals(p_month date)
returns table (
  club_id uuid,
  nc_level customer_nc_level,
  kind text,
  customer_name text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  )
  select
    cu.nc_club_id as club_id,
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  cross join bounds b
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between b.month_start and b.month_end

  union all

  select
    cu.nc_club_id as club_id,
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  cross join bounds b
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between b.month_start and b.month_end

  order by club_id, nc_level, created_at desc;
$$;

-- Cross-club leaderboards for the Branches "Monthly" tab, spanning the
-- caller's own club and every sponsored branch. Returns three ranked lists
-- tagged by `board` (client splits on this): most new 5-day trial sign-ups,
-- most 10/20/30-day activity at the 30-day level (new + renewed), and
-- highest average Coach's Cup per operating day. club_id lets the client
-- also re-slice the coach_cup_avg rows per club, for the expandable
-- per-coach breakdown under each club's "Avg Coach's Cup / Day" stat.
--
-- Every board is restricted to events (signups, renewals, check-ins) that
-- happened at the SAME club the coach is registered under — a customer's
-- "Coach" field can point to a coach registered at a different club (they
-- invited them before moving, or the customer now walks into a different
-- branch), and those shouldn't inflate that coach's leaderboard stats for a
-- club they don't actually belong to.
--
-- Adding club_id changes the return columns, which CREATE OR REPLACE can't
-- do — drop the old 5-column version first.
drop function if exists branches_monthly_leaderboards(date);

create or replace function branches_monthly_leaderboards(p_month date)
returns table (
  board text,
  coach_id uuid,
  coach_name text,
  club_id uuid,
  club_name text,
  value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  new_5day_by_coach as (
    select cu.coach_id, count(*) as n
    from customers cu
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cu.initial_nc_level = '5-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  new_30_signups as (
    select cu.coach_id, count(*) as n
    from customers cu
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cu.initial_nc_level = '30-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  renew_30 as (
    select cu.coach_id, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cr.nc_level = '30-day'
      and cr.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  total_30_by_coach as (
    select coach_id, sum(n) as n
    from (
      select coach_id, n from new_30_signups
      union all
      select coach_id, n from renew_30
    ) x
    group by coach_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  club_checkins as (
    select ci.nc_club_id as club_id, ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id in (select club_id from my_clubs)
  ),
  operating_days as (
    select club_id, count(distinct checkin_date) as n
    from club_checkins
    group by club_id
  ),
  coach_cup_by_coach as (
    select cu.coach_id, cc.club_id, coalesce(sum(cc.cups), 0) as total_cups
    from club_checkins cc
    join customers cu on cu.id = cc.customer_id
    join coaches co on co.id = cu.coach_id
    where cu.coach_id is not null
      and co.nc_club_id = cc.club_id
      and not exists (
        select 1 from excluded_per_club ec
        where ec.club_id = cc.club_id and ec.customer_id = cu.id and cc.checkin_date >= ec.excluded_since
      )
    group by cu.coach_id, cc.club_id
  ),
  coach_cup_avg_rows as (
    select
      co.id as coach_id,
      co.name as coach_name,
      nc.id as club_id,
      nc.name as club_name,
      round(cb.total_cups::numeric / od.n, 2) as value
    from coach_cup_by_coach cb
    join coaches co on co.id = cb.coach_id
    join nc_clubs nc on nc.id = co.nc_club_id
    join operating_days od on od.club_id = cb.club_id and od.n > 0
  )
  select 'new_5day' as board, co.id as coach_id, co.name as coach_name, nc.id as club_id, nc.name as club_name, n5.n::numeric as value
  from new_5day_by_coach n5
  join coaches co on co.id = n5.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'total_30day', co.id, co.name, nc.id, nc.name, t30.n::numeric
  from total_30_by_coach t30
  join coaches co on co.id = t30.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'coach_cup_avg', coach_id, coach_name, club_id, club_name, value
  from coach_cup_avg_rows
  order by board, value desc;
$$;

-- Each visible club's best single day ever (all history, today included —
-- unlike club_all_time_high_cups()/coach_all_time_high_cups(), this is a
-- plain "what's the record" lookup, not a "did today just beat it" check,
-- so there's no reason to exclude today). Powers the Records tab on
-- /branches. club_id/club_name still returned with null record_date/
-- total_cups for a club with no check-ins yet, so every visible club shows
-- up even without a record.
create or replace function branches_cup_records()
returns table (club_id uuid, club_name text, record_date date, total_cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  daily as (
    select nc_club_id as club_id, checkin_date, sum(cups) as total_cups
    from checkins
    where nc_club_id in (select club_id from my_clubs)
      and not voided
    group by nc_club_id, checkin_date
  ),
  ranked as (
    select
      club_id, checkin_date, total_cups,
      row_number() over (partition by club_id order by total_cups desc, checkin_date desc) as rn
    from daily
  )
  select mc.club_id, mc.club_name, r.checkin_date, r.total_cups
  from my_clubs mc
  left join ranked r on r.club_id = mc.club_id and r.rn = 1
  order by mc.club_name;
$$;

-- Companion to branches_cup_records() — each coach's own best single day
-- ever, within the club they're registered under (same restriction as
-- daily_coach_cups()/branches_monthly_leaderboards(): a customer's "Coach"
-- field can point to a coach registered at a different club, and those
-- don't count toward this club's coach records). Same date-aware
-- exclusion rule as everywhere else Coach's Cup is computed. A coach with
-- no eligible check-ins ever just doesn't appear — no null placeholder
-- row, since (unlike a club) there's no fixed roster to fill in for.
create or replace function branches_coach_cup_records()
returns table (club_id uuid, coach_id uuid, coach_name text, record_date date, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  daily as (
    select cu.coach_id, ci.nc_club_id as club_id, ci.checkin_date, sum(ci.cups) as cups
    from checkins ci
    join customers cu on cu.id = ci.customer_id
    join coaches co on co.id = cu.coach_id
    where ci.nc_club_id in (select club_id from my_clubs)
      and not ci.voided
      and co.nc_club_id = ci.nc_club_id
      and not exists (
        select 1 from excluded_per_club ec
        where ec.club_id = ci.nc_club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
      )
    group by cu.coach_id, ci.nc_club_id, ci.checkin_date
  ),
  ranked as (
    select
      coach_id, club_id, checkin_date, cups,
      row_number() over (partition by coach_id, club_id order by cups desc, checkin_date desc) as rn
    from daily
  )
  select r.club_id, co.id as coach_id, co.name as coach_name, r.checkin_date as record_date, r.cups
  from ranked r
  join coaches co on co.id = r.coach_id
  where r.rn = 1
  order by r.club_id, r.cups desc;
$$;

grant execute on function coach_cup_excluded_customer_ids(date, uuid) to authenticated;
grant execute on function coach_cup_exclusion_dates(uuid) to authenticated;
grant execute on function plugin_lineage_customer_ids(uuid) to authenticated;
grant execute on function daily_totals(date, uuid) to authenticated;
grant execute on function daily_coach_cups(date, uuid) to authenticated;
grant execute on function daily_branch_coach_cups(date, uuid) to authenticated;
grant execute on function club_all_time_high_cups(uuid, date) to authenticated;
grant execute on function coach_all_time_high_cups(uuid, uuid, date) to authenticated;
grant execute on function branches_cup_records() to authenticated;
grant execute on function branches_coach_cup_records() to authenticated;
grant execute on function upcoming_birthdays(uuid) to authenticated;
grant execute on function monthly_totals(date, uuid) to authenticated;
grant execute on function monthly_coach_cups(date, uuid) to authenticated;
grant execute on function monthly_package_sales(date, uuid) to authenticated;
grant execute on function monthly_daily_breakdown(date, uuid) to authenticated;
grant execute on function monthly_coach_cups_by_day(date, uuid) to authenticated;
grant execute on function monthly_cup_records(date, uuid) to authenticated;
grant execute on function monthly_inventory_report(date, uuid) to authenticated;
grant execute on function weekly_totals(date, uuid) to authenticated;
grant execute on function weekly_new_renewals(date, uuid) to authenticated;
grant execute on function weekly_customer_attendance(date, uuid) to authenticated;
grant execute on function weekly_coach_cup_by_coach(date, uuid) to authenticated;
grant execute on function list_branch_clubs() to authenticated;
grant execute on function branches_coach_cups_compare(date) to authenticated;
grant execute on function branches_new_renewals(date) to authenticated;
grant execute on function branches_daily_summary(date) to authenticated;
grant execute on function branches_daily_remarks(date) to authenticated;
grant execute on function branches_weekly_summary(date) to authenticated;
grant execute on function branches_weekly_new_renewals(date) to authenticated;
grant execute on function branches_weekly_coach_cups(date) to authenticated;
grant execute on function branches_monthly_summary(date) to authenticated;
grant execute on function branches_monthly_new_renewals(date) to authenticated;

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
    and not t.voided
  where p.active
  group by p.id, p.name, p.vp
  order by p.name;
$$;

grant execute on function inventory_stock_levels() to authenticated;

-- Lets an admin void a mis-entered stock movement — same correction model
-- as void_checkin(): a reason is required, who/when/why is recorded on the
-- row itself, and voided rows drop out of inventory_stock_levels() above.
create or replace function void_inventory_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_txn inventory_transactions%rowtype;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void inventory records';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a record';
  end if;

  select * into v_txn from inventory_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_txn.voided then
    raise exception 'Already voided';
  end if;
  if v_txn.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot void records outside your club';
  end if;

  update inventory_transactions
  set voided = true, voided_by = v_editor_id, void_reason = p_reason, voided_at = now()
  where id = p_transaction_id;
end;
$$;

grant execute on function void_inventory_transaction(uuid, text) to authenticated;

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

-- Total quantity and VP of product stocked OUT for internal use in a given
-- month, per product — powers the "Consumption VP" stat and per-product
-- breakdown on NC Metrics. "Consumption" deliberately excludes anything
-- tied to a customer (a sale or a loan) — customer_id is null here, so only
-- stock a coach used up themselves counts. Same p_month/p_club_id/visibility
-- shape as the other monthly_* RPCs; voided movements don't count either.
create or replace function monthly_inventory_out(p_month date, p_club_id uuid default null)
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  qty bigint,
  total_vp numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  club_out as (
    select t.product_id, t.quantity
    from inventory_transactions t
    cross join bounds b
    cross join target_club tc
    where t.direction = 'out'
      and not t.voided
      and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
      and t.nc_club_id = tc.id
      and t.nc_club_id in (select visible_club_ids(current_coach_id()))
  )
  select
    p.id,
    p.name,
    p.vp,
    sum(co.quantity) as qty,
    sum(co.quantity) * p.vp as total_vp
  from club_out co
  join products p on p.id = co.product_id
  group by p.id, p.name, p.vp
  order by total_vp desc;
$$;

grant execute on function monthly_inventory_out(date, uuid) to authenticated;
grant execute on function branches_monthly_leaderboards(date) to authenticated;
