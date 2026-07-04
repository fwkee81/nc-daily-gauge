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
  consumption_balance integer not null default 0,
  invited_by_type invited_by_type not null,
  invited_by_coach_id uuid references coaches (id),
  invited_by_customer_id uuid references customers (id),
  -- Separate from invited_by: the coach this customer is "under" for
  -- Coach's Cup attribution. Invited by can be a coach, another customer, or
  -- Plug-in, but Coach's Cup should still be assignable to a coach either way.
  coach_id uuid references coaches (id),
  member_id text,
  member_type member_type,
  remark text,
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
  )
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
  created_at timestamptz not null default now()
);

create index idx_customers_nc_club on customers (nc_club_id);
create index idx_customers_invited_by_coach on customers (invited_by_coach_id);
create index idx_customers_invited_by_customer on customers (invited_by_customer_id);
create index idx_customers_coach on customers (coach_id);
create index idx_customers_name on customers (name);
create index idx_customer_members_customer on customer_members (customer_id);
create index idx_coaches_sponsor on coaches (sponsor_id);
create index idx_checkins_customer on checkins (customer_id);
create index idx_checkins_member on checkins (member_id);
create index idx_checkins_club_date on checkins (nc_club_id, checkin_date);
create index idx_checkin_edits_checkin on checkin_edits (checkin_id);
create index idx_customer_renewals_customer on customer_renewals (customer_id);

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

-- nc_clubs: club names aren't sensitive; any signed-in coach can search/create
-- one during onboarding (find-or-create by name).
create policy "nc_clubs_select" on nc_clubs
  for select to authenticated using (true);
create policy "nc_clubs_insert" on nc_clubs
  for insert to authenticated with check (true);

-- coaches: readable by any signed-in coach (needed to populate sponsor /
-- invited-by pickers, including across clubs, and so any admin can view
-- their downline network's coaches). A coach may edit their own row's safe
-- fields; only the super admin may edit any coach (including position,
-- level, sponsor, club, member ID, active) — including downline coaches —
-- so no cross-club edit disputes between branch admins. The
-- restrict_coach_self_update trigger below stops a non-super-admin from
-- using their own-row update rights to promote themselves or hop clubs.
create policy "coaches_select" on coaches
  for select to authenticated using (true);
create policy "coaches_insert_self" on coaches
  for insert to authenticated with check (auth_user_id = auth.uid());
create policy "coaches_update_self" on coaches
  for update to authenticated using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
create policy "coaches_update_admin" on coaches
  for update to authenticated
  using (
    is_super_admin()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  )
  with check (
    is_super_admin()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  );

-- A non-super-admin can update their own coaches row (per coaches_update_self
-- above), but must not be able to use that to promote themselves to admin,
-- change their level/sponsor, hop to another club, or edit their member ID.
-- Only the super admin (via coaches_update_admin) may change those fields.
create or replace function restrict_coach_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_super_admin() then
    return new;
  end if;

  if new.nc_position is distinct from old.nc_position
    or new.level is distinct from old.level
    or new.sponsor_id is distinct from old.sponsor_id
    or new.nc_club_id is distinct from old.nc_club_id
    or new.member_id is distinct from old.member_id
    or new.active is distinct from old.active then
    raise exception 'Only the network admin can change position, level, sponsor, club, member ID, or active status';
  end if;

  return new;
end;
$$;

create trigger coaches_restrict_self_update
before update on coaches
for each row execute function restrict_coach_self_update();

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

-- =========================================================================
-- WRITE RPCs (check-in, corrections)
-- =========================================================================

-- Adding p_member_id changes the argument list, so CREATE OR REPLACE would
-- leave the old 4-arg signature behind as a separate (now-dead) overload —
-- drop it first.
drop function if exists record_checkin(uuid, integer, consumption_type, date);

create or replace function record_checkin(
  p_customer_id uuid,
  p_cups integer,
  p_consumption_type consumption_type,
  p_checkin_date date,
  p_member_id uuid default null
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_result checkins;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  if not exists (select 1 from customers where id = p_customer_id and nc_club_id = v_club_id and active) then
    raise exception 'Customer not found in your club';
  end if;

  if p_member_id is not null and not exists (
    select 1 from customer_members where id = p_member_id and customer_id = p_customer_id and active
  ) then
    raise exception 'Family member not found for this customer';
  end if;

  insert into checkins (customer_id, member_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (p_customer_id, p_member_id, v_club_id, p_cups, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = consumption_balance - p_cups
  where id = p_customer_id;

  return v_result;
end;
$$;

-- Creates a one-time "Ala Carte" walk-in customer, checks them in for a
-- single cup, and immediately deactivates them (they won't show up in the
-- Customers list or check-in search again). Admin-only. If they come back
-- to start a real package, an admin can reactivate + edit their profile
-- from the Customers page instead of creating a duplicate record.
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
    nc_club_id, name, gender, contact, dob, nc_level, consumption_balance,
    invited_by_type, invited_by_coach_id, invited_by_customer_id, coach_id,
    created_by, active
  )
  values (
    v_club_id, p_name, 'Others', p_contact, null, 'Ala Carte', 1,
    p_invited_by_type, p_invited_by_coach_id, p_invited_by_customer_id,
    case when p_invited_by_type = 'coach' then p_invited_by_coach_id else null end,
    v_coach_id, true
  )
  returning id into v_customer_id;

  insert into checkins (customer_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (v_customer_id, v_club_id, 1, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = 0, active = false where id = v_customer_id;

  return v_result;
end;
$$;

create or replace function correct_checkin(
  p_checkin_id uuid,
  p_new_cups integer,
  p_new_consumption_type consumption_type,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_checkin checkins%rowtype;
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

  v_delta := p_new_cups - v_checkin.cups;

  update checkins
  set cups = p_new_cups, consumption_type = p_new_consumption_type
  where id = p_checkin_id;

  if v_delta <> 0 then
    update customers set consumption_balance = consumption_balance - v_delta
    where id = v_checkin.customer_id;
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
  update customers set consumption_balance = consumption_balance + v_checkin.cups
  where id = v_checkin.customer_id;
end;
$$;

-- Adds cups to a customer's consumption balance when they renew their NC
-- card, and records the renewal for audit purposes. Admin-only, own club.
create or replace function renew_customer(
  p_customer_id uuid,
  p_nc_level customer_nc_level,
  p_cups_added integer
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

  insert into customer_renewals (customer_id, renewed_by, nc_level, cups_added, previous_balance, new_balance)
  values (p_customer_id, v_coach_id, p_nc_level, p_cups_added, v_customer.consumption_balance, v_new_balance);

  update customers
  set consumption_balance = v_new_balance, nc_level = p_nc_level
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

grant execute on function record_checkin(uuid, integer, consumption_type, date, uuid) to authenticated;
grant execute on function correct_checkin(uuid, integer, consumption_type, text) to authenticated;
grant execute on function void_checkin(uuid, text) to authenticated;
grant execute on function renew_customer(uuid, customer_nc_level, integer) to authenticated;
grant execute on function record_walkin_checkin(text, text, invited_by_type, uuid, uuid, consumption_type, date) to authenticated;

-- =========================================================================
-- REPORTING RPCs
-- =========================================================================

-- All reporting RPCs take an optional p_club_id. When omitted, they default
-- to the caller's own club. When given, they're still authorized against
-- visible_club_ids() — a coach can only ever look at their own club or a
-- branch club whose Owner named them as sponsor (see list_branch_clubs()
-- below and the /branches page). Reports are per-club, not auto-merged
-- across branches, so numbers are always attributable to one specific club.

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (
  total_cups bigint,
  plugin_cups bigint,
  coach_cup_total bigint,
  dine_in_cups bigint,
  takeaway_cups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (where cu.invited_by_type = 'plugin'), 0) as plugin_cups,
    -- Mirrors the daily_coach_cups() eligibility rule (coach assigned, member
    -- type not SP/WT/AWT/TAB, and not invited by a customer whose own member
    -- type is SP/WT/AWT/TAB), summed across every coach for this club/date.
    coalesce(sum(ci.cups) filter (
      where cu.coach_id is not null
        and (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
        and not exists (
          select 1 from customers inviter
          where inviter.id = cu.invited_by_customer_id
            and inviter.member_type in ('SP', 'WT', 'AWT', 'TAB')
        )
    ), 0) as coach_cup_total,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Dine-in'), 0) as dine_in_cups,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Take-away'), 0) as takeaway_cups
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
-- customer with a coach assigned, EXCEPT member types SP, WT, AWT, TAB (a
-- null/unset member_type still counts) — and EXCEPT a customer invited by
-- another customer whose own member type is SP, WT, AWT, or TAB, even if
-- the invitee's own member type would otherwise qualify.
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
    and (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
    and not exists (
      select 1 from customers inviter
      where inviter.id = cu.invited_by_customer_id
        and inviter.member_type in ('SP', 'WT', 'AWT', 'TAB')
    )
  group by co.id, co.name
  order by cups desc;
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
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(cc.cups), 0) as total_cups,
    round(coalesce(sum(cc.cups), 0)::numeric / nullif((select n from operating_days), 0), 2) as avg_daily_cups
  from club_checkins cc
  join customers cu on cu.id = cc.customer_id
  join coaches co on co.id = cu.coach_id
  where (cu.member_type is null or cu.member_type not in ('SP', 'WT', 'AWT', 'TAB'))
    and not exists (
      select 1 from customers inviter
      where inviter.id = cu.invited_by_customer_id
        and inviter.member_type in ('SP', 'WT', 'AWT', 'TAB')
    )
  group by co.id, co.name
  order by total_cups desc;
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

grant execute on function daily_totals(date, uuid) to authenticated;
grant execute on function daily_coach_cups(date, uuid) to authenticated;
grant execute on function upcoming_birthdays(uuid) to authenticated;
grant execute on function monthly_totals(date, uuid) to authenticated;
grant execute on function monthly_coach_cups(date, uuid) to authenticated;
grant execute on function list_branch_clubs() to authenticated;
